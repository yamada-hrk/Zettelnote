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
// ============================================================
import * as searchImpl from '../../../electron/search.js';
import * as tagsImpl from '../../../electron/tags.js';
import type { RecommendItem } from '../types';

interface Doc {
  id: string;
  title: string;
  body: string;
}

export function vectorSearch(query: string, docs: Doc[], topK: number): RecommendItem[] {
  const results = (searchImpl as any).vectorSearch(query, docs, topK);
  return results.map((r: any) => ({ ...r, uid: r.id }));
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
