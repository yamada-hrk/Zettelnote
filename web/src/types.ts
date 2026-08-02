// ============================================================
// Web版の型定義
//
// デスクトップ版(src/types.ts)とは主キーの性質が異なるため
// (デスクトップ: SQLite の連番 id / Web: サーバー同期の uid 文字列)、
// 型定義自体は共有せず Web版専用に定義している。
// 検索アルゴリズム本体(electron/search.js・tags.js)は
// web/src/lib/search.ts 経由でそのまま共有している
// ============================================================

export interface NoteMeta {
  uid: string;
  title: string;
  /** 更新日時(epoch ms) */
  updatedMs: number;
  preview: string;
  tags: string[];
}

export interface Note {
  uid: string;
  title: string;
  body: string;
  createdAt: string;
  updatedMs: number;
}

export interface RecommendItem {
  uid: string;
  title: string;
  excerpt: string;
  score: number;
  matchedTerms?: string[];
}
