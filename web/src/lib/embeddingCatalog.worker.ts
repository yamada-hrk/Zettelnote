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
// キャッシュ本体(IndexedDB)は web/src/lib/vectorCache.ts に切り出して
// いる。フェーズ3でサーバー同期を実装する際、メインスレッド側
// (notesStore.ts)からも同じキャッシュを読み書きする必要があるため
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
import { getCachedVector, setCachedVector } from './vectorCache';

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

/**
 * カタログのvectorSearchへ渡すキャッシュアダプタ(1リクエスト=1モデルIDに固定)。
 * set()でキャッシュミス(新規計算)が起きるたびメインスレッドへ通知する。
 * サーバーへ同期すべき新しいベクトルができたことを web/src/lib/search.ts
 * 経由でリスナー(vectorSync.ts)へ伝えるための仕組み(4.2/4.3)
 */
function makeCacheAdapter(modelId: string) {
  return {
    get: (noteId: string, text: string) => getCachedVector(modelId, noteId, text),
    set: async (noteId: string, text: string, vector: number[]) => {
      await setCachedVector(modelId, noteId, text, vector);
      ctx.postMessage({ type: 'vectorComputed', noteId, modelId });
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
