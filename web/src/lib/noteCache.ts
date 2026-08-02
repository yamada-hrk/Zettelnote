// ============================================================
// メモ内容の IndexedDB キャッシュ
//
// notesStore.ts が「毎回サーバーから全件取得(since=0)」していたのを
// 「初回はキャッシュを即座に表示 → 差分(since=カーソル)だけサーバーに
// 問い合わせて反映」に変えるための永続化層。
//
// ■ 何を保存するか
//   復号済みの平文メモ + 直近の同期カーソル(server_ms)。
//   デスクトップ版のローカル SQLite も平文保存なので、設計として一貫している
//   (暗号化されているのはあくまで「サーバーへの転送・保存」の区間のみ)。
//
// ■ キャッシュのクリア
//   アカウント単位のキー分離はしない(1ブラウザ1セッションにつき1
//   アカウントの前提)。代わりに「ログアウト」「キーの記憶を削除」の
//   どちらでも clearCache() を呼び、平文メモを残さないようにしている
// ============================================================
import type { Note } from '../types';

const DB_NAME = 'zettelnote-cache';
const NOTES_STORE = 'notes';
const META_STORE = 'meta';
const CURSOR_KEY = 'cursor';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** キャッシュ済みの全メモを返す(失敗時は空配列。フォールバックとして安全) */
export async function loadCachedNotes(): Promise<Note[]> {
  try {
    const db = await openDb();
    const notes = await new Promise<Note[]>((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readonly');
      const req = tx.objectStore(NOTES_STORE).getAll();
      req.onsuccess = () => resolve((req.result as Note[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return notes;
  } catch {
    return [];
  }
}

/** 直近の同期カーソル(server_ms)を返す(無ければ 0 = 未同期として全件取得) */
export async function loadCursor(): Promise<number> {
  try {
    const db = await openDb();
    const cursor = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(CURSOR_KEY);
      req.onsuccess = () =>
        resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return cursor;
  } catch {
    return 0;
  }
}

/** メモ1件をキャッシュへ反映する(新規/更新) */
export async function upsertCachedNote(note: Note): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readwrite');
      tx.objectStore(NOTES_STORE).put(note);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // キャッシュ書き込みに失敗しても致命的ではない(表示中の state は別途正しい)
  }
}

/** メモ1件をキャッシュから削除する */
export async function deleteCachedNote(uid: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readwrite');
      tx.objectStore(NOTES_STORE).delete(uid);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op
  }
}

/** 同期カーソルを保存する */
export async function saveCursor(cursor: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(cursor, CURSOR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // カーソル保存に失敗しても次回 since=0 の全件取得にフォールバックするだけ
  }
}

/** キャッシュを全消去する(ログアウト・キーの記憶削除時に呼ぶ) */
export async function clearNoteCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([NOTES_STORE, META_STORE], 'readwrite');
      tx.objectStore(NOTES_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op
  }
}
