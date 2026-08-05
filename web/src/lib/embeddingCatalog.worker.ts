// ============================================================
// 意味的類似(ベクトル検索)の計算をメインスレッドから切り離すWorker
//
// フェーズ1ではバイグラムTF-IDFのみだったが、フェーズ2でモデル
// カタログにmpnet-base-v2が追加された(electron/embeddingCatalog.js)。
// mpnetのような重いモデルは、docs側(検索対象メモ)の埋め込みを
// IndexedDBにキャッシュし、forBodyHashが一致する限り再計算しない
// (意味的類似_埋め込みモデル導入提案.md 4.1〜4.2のローカル版)。
// クエリ側(編集中テキスト)はその場の内容なのでキャッシュ対象外
//
// @huggingface/transformers はここで静的importする(electron/
// embeddingCatalog.js 側では動的importを使っていない。CJSファイル内の
// 動的importをRolldownのWorkerビルドが解決できない制約があるため、
// embed関数はこのファイルで作ってカタログ側へ注入する設計にしている)
//
// tsconfig側は DOM lib を使っており WebWorker lib と共存できないため、
// self を Worker型へキャストして型を得ている
// ============================================================
import { pipeline } from '@huggingface/transformers';
import * as catalogImpl from '../../../electron/embeddingCatalog.js';
import { hashText } from '../../../electron/textHash.js';

interface Doc {
  id: string;
  title: string;
  body: string;
}

interface RequestMessage {
  requestId: number;
  modelId: string;
  query: string;
  docs: Doc[];
  topK: number;
}

const ctx = self as unknown as Worker;

// ---- mpnet埋め込み関数(遅延ロード。モデル本体のダウンロードは初回のみ) ----

let extractorPromise: Promise<any> | null = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-mpnet-base-v2',
      { dtype: 'q8' },
    );
  }
  return extractorPromise;
}

async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// ---- IndexedDBキャッシュ(モデルごとに forBodyHash 付きでベクトルを保持) ----

const DB_NAME = 'zettelnote-vector-cache';
const STORE_NAME = 'vectors';

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

interface CacheEntry {
  forBodyHash: string;
  vector: number[];
}

/** カタログのvectorSearchへ渡すキャッシュアダプタ。キーは `${modelId}:${noteId}` */
function makeCacheAdapter(modelId: string) {
  return {
    async get(noteId: string, text: string): Promise<number[] | null> {
      const db = await openDb();
      const key = `${modelId}:${noteId}`;
      const forBodyHash = hashText(text);
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          const entry = req.result as CacheEntry | undefined;
          resolve(entry && entry.forBodyHash === forBodyHash ? entry.vector : null);
        };
        req.onerror = () => resolve(null);
      });
    },
    async set(noteId: string, text: string, vector: number[]): Promise<void> {
      const db = await openDb();
      const key = `${modelId}:${noteId}`;
      const forBodyHash = hashText(text);
      const entry: CacheEntry = { forBodyHash, vector };
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(entry, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    },
  };
}

ctx.onmessage = async (e: MessageEvent<RequestMessage>) => {
  const { requestId, modelId, query, docs, topK } = e.data;
  const entry = (catalogImpl as any).getCatalogEntry(modelId);
  const cache = entry.needsCache ? makeCacheAdapter(modelId) : undefined;
  const embedder = entry.needsEmbedder ? embed : undefined;
  const result = await entry.vectorSearch(query, docs, topK, cache, embedder);
  ctx.postMessage({ requestId, result });
};
