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

/** サーバー同期のステータス(メインプロセスから通知される) */
export interface SyncStatus {
  /** 同期が設定済みか(サーバー接続情報 + 暗号化キーが揃っている) */
  configured: boolean;
  /** 同期処理の実行中か */
  syncing: boolean;
  /** 最後に同期が成功した時刻(epoch ms)。未同期なら null */
  lastSyncAt: number | null;
  /** 直近のエラーメッセージ。正常なら null */
  lastError: string | null;
  serverUrl: string | null;
  /** ログイン中のアカウント名(ローカルモードなら null) */
  account: string | null;
  /** 直近の同期でリモートから取り込んだ件数(完了通知にのみ含まれる) */
  pulled?: number;
}
