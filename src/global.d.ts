// ============================================================
// preload で公開される window.api の型定義
// ============================================================
import type { Note, NoteMeta, RecommendResult } from './types';

declare global {
  interface Window {
    api: {
      listNotes: () => Promise<NoteMeta[]>;
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
    };
  }
}

export {};
