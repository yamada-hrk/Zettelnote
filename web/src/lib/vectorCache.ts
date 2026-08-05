// ============================================================
// 意味的類似のベクトル ローカルキャッシュ(IndexedDB)
//
// 意味的類似_埋め込みモデル導入提案.md 4.1 の設計通り、1メモにつき
// 「カタログエントリIDをキーにしたマップ」を1レコードとして持つ
// (通常はエントリ1つ、モデル切り替えの移行期間だけ複数)。
//
//   vectors[noteId] = {
//     "mpnet-multilingual-base-v2-int8-v1": { forBodyHash, vector },
//   }
//
// Worker(embeddingCatalog.worker.ts、計算結果の読み書き)と
// メインスレッド(notesStore.ts、サーバー同期のための読み書き)の
// 両方から使う共有モジュール。IndexedDBはWorker・メインスレッド
// どちらからもアクセスできるため、Worker経由にする必要はない
// ============================================================
import { hashText } from '../../../electron/textHash.js';

const DB_NAME = 'zettelnote-vector-cache';
const STORE_NAME = 'vectors';
const META_STORE_NAME = 'meta';
const CURSOR_KEY = 'syncCursor';

export interface VectorEntry {
  forBodyHash: string;
  vector: number[];
}

export type NoteVectors = Record<string, VectorEntry>;

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        if (!db.objectStoreNames.contains(META_STORE_NAME)) db.createObjectStore(META_STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** ノート1件分のベクトルマップ全体を取得する(無ければ空オブジェクト) */
export async function getNoteVectors(noteId: string): Promise<NoteVectors> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(noteId);
    req.onsuccess = () => resolve((req.result as NoteVectors) || {});
    req.onerror = () => resolve({});
  });
}

/** ノート1件分のベクトルマップ全体を書き込む(既存の内容を丸ごと置き換える) */
export async function putNoteVectors(noteId: string, vectors: NoteVectors): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(vectors, noteId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * 指定エントリ(モデル)のキャッシュ済みベクトルを取得する。
 * forBodyHash が現在の本文と一致しない(=陳腐化している)場合は
 * null を返す(意味的類似_埋め込みモデル導入提案.md 4.1 の判定式)
 */
export async function getCachedVector(
  catalogEntryId: string,
  noteId: string,
  text: string,
): Promise<number[] | null> {
  const map = await getNoteVectors(noteId);
  const entry = map[catalogEntryId];
  if (!entry) return null;
  return entry.forBodyHash === hashText(text) ? entry.vector : null;
}

/** 指定エントリ(モデル)のベクトルを計算結果として書き込む(他エントリ分は保持する) */
export async function setCachedVector(
  catalogEntryId: string,
  noteId: string,
  text: string,
  vector: number[],
): Promise<void> {
  const map = await getNoteVectors(noteId);
  map[catalogEntryId] = { forBodyHash: hashText(text), vector };
  await putNoteVectors(noteId, map);
}

/** ベクトル同期(4.2)の直近カーソル(server_ms)を返す(無ければ0=未同期) */
export async function loadVectorSyncCursor(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE_NAME, 'readonly');
    const req = tx.objectStore(META_STORE_NAME).get(CURSOR_KEY);
    req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
    req.onerror = () => resolve(0);
  });
}

/** ベクトル同期の直近カーソルを保存する */
export async function saveVectorSyncCursor(cursor: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(META_STORE_NAME, 'readwrite');
    tx.objectStore(META_STORE_NAME).put(cursor, CURSOR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** ノート削除時にキャッシュも削除する */
export async function deleteNoteVectors(noteId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(noteId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
