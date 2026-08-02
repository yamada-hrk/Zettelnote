// ============================================================
// preload で公開される window.api の型定義
// ============================================================
import type { Note, NoteMeta, RecommendResult, SyncStatus } from './types';

declare global {
  interface Window {
    api: {
      listNotes: () => Promise<NoteMeta[]>;
      searchNotes: (query: string) => Promise<NoteMeta[]>;
      getNote: (id: number) => Promise<Note | null>;
      createNote: () => Promise<Note>;
      updateNote: (
        id: number,
        patch: { title?: string; body?: string }
      ) => Promise<Note | null>;
      deleteNote: (id: number) => Promise<{ ok: boolean }>;
      recommend: (payload: {
        excludeId: number | null;
        text: string;
      }) => Promise<RecommendResult>;
      // ---- サーバー同期(Step2) ----
      syncGetStatus: () => Promise<SyncStatus>;
      syncGetPassphrase: () => Promise<string | null>;
      syncConfigure: (payload: {
        serverUrl: string;
        username: string;
        password: string;
        passphrase: string;
        /** true: 新規登録 / false: ログイン */
        register: boolean;
      }) => Promise<{ ok: boolean; error?: string }>;
      syncNow: () => Promise<boolean>;
      syncDisable: () => Promise<boolean>;
      onSyncStatus: (callback: (status: SyncStatus) => void) => () => void;
    };
  }
}

export {};
