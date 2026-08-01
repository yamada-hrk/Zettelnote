// ============================================================
// 共有型定義
// ============================================================

/** メモ一覧用のメタ情報 */
export interface NoteMeta {
  id: number;
  title: string;
  updated_at: string;
  /** 本文の先頭抜粋(一覧表示用) */
  preview: string;
  /** 本文から抽出されたハッシュタグ(正規化済み・出現順) */
  tags: string[];
}

/** メモ本体 */
export interface Note {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** レコメンド1件分 */
export interface RecommendItem {
  id: number;
  title: string;
  excerpt: string;
  /** 類似度スコア(0〜1) */
  score: number;
  /** キーワード検索時のみ: 一致した語 */
  matchedTerms?: string[];
  /** 編集中メモと共通のハッシュタグ(タグによる繋がりの可視化用) */
  sharedTags?: string[];
}

/** レコメンド検索の結果(両タブ分) */
export interface RecommendResult {
  vector: RecommendItem[];
  keyword: RecommendItem[];
}

/** レコメンドのタブ種別 */
export type RecommendMode = 'vector' | 'keyword';
