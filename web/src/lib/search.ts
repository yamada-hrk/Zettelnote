// ============================================================
// 検索ロジックへの型付きラッパー
//
// electron/search.js・electron/tags.js を「コピー」ではなく直接
// import することで、デスクトップ版と検索アルゴリズムを完全に
// 同じソースファイルで共有している(2箇所のメンテは発生しない)。
// これらのファイルは Node 固有の API を使っていないため、
// ブラウザ(Vite バンドル)でもそのまま動作する。
//
// search.js は JSDoc で id: number を仮定した型注釈になっている
// (デスクトップ版が SQLite の連番 id を使うため)。Web版では
// uid 文字列をそのまま id として渡しても実行時は問題ない
// (アルゴリズムは id の型を一切見ておらず、結果にそのまま
// 詰め替えて返すだけ)ため、この境界だけ any で型を橋渡ししている
//
// 意味的類似(vectorSearch)だけはWeb Worker上で計算する(4.3)。
// フェーズ1時点ではWorker内で呼んでいるのがバイグラムTF-IDF
// (計算コストはほぼゼロ)なのでWorker化の恩恵はまだ無いが、将来
// 重い埋め込みモデルに差し替わってもメインスレッド(UI)をブロック
// しない構造を先に用意しておく。呼び出しが非同期になった点を除き、
// 呼び出し側から見た挙動(結果の内容)は従来と同一
// ============================================================
import * as searchImpl from '../../../electron/search.js';
import * as tagsImpl from '../../../electron/tags.js';
import * as catalogImpl from '../../../electron/embeddingCatalog.js';
import type { RecommendItem } from '../types';

interface Doc {
  id: string;
  title: string;
  body: string;
}

export const DEFAULT_MODEL_ID: string = (catalogImpl as any).DEFAULT_MODEL_ID;
export const modelCatalog: { id: string; label: string; description: string }[] =
  (catalogImpl as any).catalog.map((c: any) => ({
    id: c.id,
    label: c.label,
    description: c.description,
  }));

let worker: Worker | null = null;
let nextRequestId = 0;
const pendingSearches = new Map<number, (result: RecommendItem[]) => void>();
const pendingWarms = new Map<
  number,
  { onProgress: (done: number, total: number) => void; resolve: () => void }
>();

/**
 * Workerが新しいベクトルを計算した(=IndexedDBキャッシュに書き込んだ)
 * ことを知らせるリスナー。サーバーへの同期(vectorSync.ts)が使う
 */
export type VectorComputedListener = (noteId: string, modelId: string) => void;
const vectorComputedListeners = new Set<VectorComputedListener>();
export function onVectorComputed(listener: VectorComputedListener): () => void {
  vectorComputedListeners.add(listener);
  return () => vectorComputedListeners.delete(listener);
}

type WorkerMessage =
  | { requestId: number; result: any[] }
  | { type: 'vectorComputed'; noteId: string; modelId: string }
  | { type: 'warmCacheProgress'; requestId: number; done: number; total: number }
  | { type: 'warmCacheDone'; requestId: number };

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./embeddingCatalog.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const data = e.data;
      if ('type' in data && data.type === 'vectorComputed') {
        vectorComputedListeners.forEach((l) => l(data.noteId, data.modelId));
        return;
      }
      if ('type' in data && data.type === 'warmCacheProgress') {
        pendingWarms.get(data.requestId)?.onProgress(data.done, data.total);
        return;
      }
      if ('type' in data && data.type === 'warmCacheDone') {
        pendingWarms.get(data.requestId)?.resolve();
        pendingWarms.delete(data.requestId);
        return;
      }
      const { requestId, result } = data as { requestId: number; result: any[] };
      const resolve = pendingSearches.get(requestId);
      if (!resolve) return; // 呼び出し元が既にキャンセル済み(古いリクエスト)
      pendingSearches.delete(requestId);
      resolve(result.map((r: any) => ({ ...r, uid: r.id })));
    };
  }
  return worker;
}

/**
 * 意味的類似検索。Worker上で計算するため非同期(4.3)。
 * modelId は4.4のアカウント単位のモデル選択に対応する
 */
export function vectorSearch(
  query: string,
  docs: Doc[],
  topK: number,
  modelId: string = DEFAULT_MODEL_ID,
): Promise<RecommendItem[]> {
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pendingSearches.set(requestId, resolve);
    getWorker().postMessage({ requestId, modelId, query, docs, topK });
  });
}

/**
 * モデル切り替え時の一括再計算(4.4)。docs全件の埋め込みを事前に
 * キャッシュへ書き込む(検索結果は返さない)。onProgressで
 * (処理済み件数, 総件数)を都度通知する(4.5の進捗表示に使う)
 */
export function warmCache(
  docs: Doc[],
  modelId: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pendingWarms.set(requestId, { onProgress, resolve });
    getWorker().postMessage({ kind: 'warmCache', requestId, modelId, docs });
  });
}

export function keywordSearch(query: string, docs: Doc[], topK: number): RecommendItem[] {
  const results = (searchImpl as any).keywordSearch(query, docs, topK);
  return results.map((r: any) => ({ ...r, uid: r.id }));
}

export function keywordFilter(query: string, docs: Doc[]): Doc[] {
  return (searchImpl as any).keywordFilter(query, docs);
}

export function extractTags(text: string): string[] {
  return (tagsImpl as any).extractTags(text);
}
