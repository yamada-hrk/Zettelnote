// ============================================================
// メモのデータストア(Web版)
//
// electron/sync.js の Pull/Push ロジックに相当するものを、
// ブラウザ内で完結させたもの。サーバーが唯一の正であり続けるが、
// 復号済みのメモと同期カーソルを IndexedDB(noteCache.ts)に
// キャッシュすることで:
//   - 初回表示: キャッシュがあれば「読み込み中…」を待たずに即座に表示
//   - 2回目以降: サーバーには前回同期以降の差分(since=カーソル)だけを
//     問い合わせる(desktop版の sync.js と同じ差分同期の考え方)
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './apiClient';
import { decryptJson, encryptJson } from './webCrypto';
import {
  loadCachedNotes,
  loadCursor,
  upsertCachedNote,
  deleteCachedNote,
  saveCursor,
} from './noteCache';
import type { Note } from '../types';

const sortByUpdatedDesc = (notes: Note[]) =>
  [...notes].sort((a, b) => b.updatedMs - a.updatedMs);

export function useNotesStore(token: string, key: CryptoKey) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 差分マージ・キャッシュ書き込みで参照する、現在の全メモの索引
  // (state の notes は表示用のソート済み配列なので、マージ作業には
  // ref 側の Map を使う。マージのたびに setNotes で state に反映する)
  const indexRef = useRef<Map<string, Note>>(new Map());

  /** サーバーとの差分同期(since=カーソル)を行い、キャッシュにも反映する */
  const syncDelta = useCallback(async () => {
    try {
      const cursor = await loadCursor();
      const res = await api.getNotes(token, cursor);
      for (const rec of res.notes) {
        if (rec.deleted) {
          indexRef.current.delete(rec.uid);
          void deleteCachedNote(rec.uid);
          continue;
        }
        if (!rec.payload || !rec.iv) continue;
        try {
          const plain = await decryptJson(key, rec.iv, rec.payload);
          const note: Note = {
            uid: rec.uid,
            title: plain.title || '',
            body: plain.body || '',
            createdAt: plain.created_at || '',
            updatedMs: rec.updatedAt,
          };
          indexRef.current.set(rec.uid, note);
          void upsertCachedNote(note);
        } catch {
          // 復号できないレコードはスキップ(鍵不一致・破損など)
        }
      }
      setNotes(sortByUpdatedDesc([...indexRef.current.values()]));
      setError(null);
      void saveCursor(res.serverNow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, key]);

  // 初回: キャッシュを読み込んで即座に表示 → 続けてサーバーと差分同期
  useEffect(() => {
    let cancelled = false;
    indexRef.current = new Map();
    (async () => {
      const cached = await loadCachedNotes();
      if (cancelled) return;
      if (cached.length > 0) {
        indexRef.current = new Map(cached.map((n) => [n.uid, n]));
        setNotes(sortByUpdatedDesc(cached));
        setLoading(false); // キャッシュがあれば「読み込み中」表示は出さない
      }
      await syncDelta();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, key]);

  // 定期同期(デスクトップ版 electron/main.js と同じく60秒間隔)。
  // syncDelta は since=カーソル の差分取得なので、リロードしなくても
  // 他端末での更新を(最大60秒遅れで)自動的に拾えるようになる
  useEffect(() => {
    const id = setInterval(() => void syncDelta(), 60_000);
    return () => clearInterval(id);
  }, [syncDelta]);

  /** メモを暗号化してサーバーへ保存し、ローカルの一覧・キャッシュにも反映する */
  const save = useCallback(
    async (uid: string, title: string, body: string, createdAt: string) => {
      const enc = await encryptJson(key, { title, body, created_at: createdAt });
      const updatedMs = Date.now();
      await api.putNotes(token, [
        { uid, iv: enc.iv, payload: enc.payload, updatedAt: updatedMs, deleted: false },
      ]);
      const note: Note = { uid, title, body, createdAt, updatedMs };
      indexRef.current.set(uid, note);
      setNotes(sortByUpdatedDesc([...indexRef.current.values()]));
      void upsertCachedNote(note);
    },
    [token, key]
  );

  /** 削除(墓標を送信) */
  const remove = useCallback(
    async (uid: string) => {
      await api.putNotes(token, [
        { uid, iv: null, payload: null, updatedAt: Date.now(), deleted: true },
      ]);
      indexRef.current.delete(uid);
      setNotes(sortByUpdatedDesc([...indexRef.current.values()]));
      void deleteCachedNote(uid);
    },
    [token]
  );

  /** 新規メモを作成して uid を返す */
  const create = useCallback(async () => {
    const uid = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await save(uid, '', '', createdAt);
    return uid;
  }, [save]);

  return { notes, loading, error, save, remove, create, refresh: syncDelta };
}
