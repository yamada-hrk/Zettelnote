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
import type { RecommendItem } from '../types';

interface Doc {
  id: string;
  title: string;
  body: string;
}

let worker: Worker | null = null;
let nextRequestId = 0;
const pendingRequests = new Map<number, (result: RecommendItem[]) => void>();

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
  | { type: 'vectorComputed'; noteId: string; modelId: string };

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./embeddingCatalog.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if ('type' in e.data && e.data.type === 'vectorComputed') {
        const { noteId, modelId } = e.data;
        vectorComputedListeners.forEach((l) => l(noteId, modelId));
        return;
      }
      const { requestId, result } = e.data as { requestId: number; result: any[] };
      const resolve = pendingRequests.get(requestId);
      if (!resolve) return; // 呼び出し元が既にキャンセル済み(古いリクエスト)
      pendingRequests.delete(requestId);
      resolve(result.map((r) => ({ ...r, uid: r.id })));
    };
  }
  return worker;
}

/**
 * 意味的類似検索。Worker上で計算するため非同期(4.3)。
 * modelId は4.4で導入するアカウント単位のモデル選択に対応する
 * (フェーズ1時点ではバイグラムTF-IDFの1択なので既定値のみ)
 */
export function vectorSearch(
  query: string,
  docs: Doc[],
  topK: number,
  modelId = 'bigram-tfidf-v1',
): Promise<RecommendItem[]> {
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pendingRequests.set(requestId, resolve);
    getWorker().postMessage({ requestId, modelId, query, docs, topK });
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
