// ============================================================
// メモのデータストア(Web版)
//
// electron/sync.js の Pull/Push ロジックに相当するものを、
// ブラウザ内で完結させたもの。サーバーが唯一の正であり、
// ローカルには保持しない(v1 スコープ: IndexedDB キャッシュは
// 未実装。既存の since カーソルによる差分取得は流用できるので、
// 次の最適化ステップとして温存している)。
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { api } from './apiClient';
import { decryptJson, encryptJson } from './webCrypto';
import type { Note } from '../types';

export function useNotesStore(token: string, key: CryptoKey) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pull = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotes(token, 0);
      const decrypted: Note[] = [];
      for (const rec of res.notes) {
        if (rec.deleted || !rec.payload || !rec.iv) continue;
        try {
          const plain = await decryptJson(key, rec.iv, rec.payload);
          decrypted.push({
            uid: rec.uid,
            title: plain.title || '',
            body: plain.body || '',
            createdAt: plain.created_at || '',
            updatedMs: rec.updatedAt,
          });
        } catch {
          // 復号できないレコードはスキップ(鍵不一致・破損など)
        }
      }
      decrypted.sort((a, b) => b.updatedMs - a.updatedMs);
      setNotes(decrypted);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, key]);

  useEffect(() => {
    void pull();
  }, [pull]);

  /** メモを暗号化してサーバーへ保存し、ローカルの一覧にも反映する */
  const save = useCallback(
    async (uid: string, title: string, body: string, createdAt: string) => {
      const enc = await encryptJson(key, { title, body, created_at: createdAt });
      const updatedMs = Date.now();
      await api.putNotes(token, [
        { uid, iv: enc.iv, payload: enc.payload, updatedAt: updatedMs, deleted: false },
      ]);
      setNotes((cur) => {
        const next = cur.filter((n) => n.uid !== uid);
        next.push({ uid, title, body, createdAt, updatedMs });
        return next.sort((a, b) => b.updatedMs - a.updatedMs);
      });
    },
    [token, key]
  );

  /** 削除(墓標を送信) */
  const remove = useCallback(
    async (uid: string) => {
      await api.putNotes(token, [
        { uid, iv: null, payload: null, updatedAt: Date.now(), deleted: true },
      ]);
      setNotes((cur) => cur.filter((n) => n.uid !== uid));
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

  return { notes, loading, error, save, remove, create, refresh: pull };
}
