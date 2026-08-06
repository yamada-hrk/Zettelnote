// ============================================================
// 意味的類似のベクトル・モデル選択のサーバー同期(フェーズ3)
//
// notesStore.ts(メモ本文の同期)とは独立した同期サイクルを持つ。
// 理由は意味的類似_埋め込みモデル導入提案.md 4.2の通り、「本文の編集」
// と「ベクトルの再計算」は別タイミングで起きるため、同じLWW
// タイムスタンプを共有すると片方の更新がもう片方を巻き込んで
// 競合してしまうのを避けるため
//
// ■ Pull: サーバー側の方が新しいベクトルがあれば取り込む
//   (他端末が計算済みのベクトルを再利用し、このメモは再計算しない)
// ■ Push: Worker が新しいベクトルを計算するたび(onVectorComputed)、
//   そのメモの現在のベクトルマップ全体を暗号化して送信する
// ============================================================
import { useCallback, useEffect, useRef } from 'react';
import { api } from './apiClient';
import { decryptJson, encryptJson } from './webCrypto';
import {
  getNoteVectors,
  putNoteVectors,
  loadVectorSyncCursor,
  saveVectorSyncCursor,
  type NoteVectors,
} from './vectorCache';
import { onVectorComputed } from './search';

/**
 * ノート1件の現在のベクトルマップ全体を暗号化してサーバーへ送る。
 * useVectorSync内部(Worker計算後の自動push)と modelSwitch.ts
 * (後片付け後の再push)の両方から使う独立関数
 */
export async function pushVectorsForNote(
  token: string,
  key: CryptoKey,
  noteId: string,
): Promise<void> {
  const vectors = await getNoteVectors(noteId);
  const enc = await encryptJson(key, vectors);
  try {
    await api.putNoteVectors(token, [
      { uid: noteId, iv: enc.iv, payload: enc.payload, updatedAt: Date.now() },
    ]);
  } catch {
    // 送信に失敗しても致命的ではない(ローカルキャッシュには残っているので、
    // 次にこのメモのベクトルが再計算された時にまとめて送られる)
  }
}

export function useVectorSync(token: string, key: CryptoKey) {
  // 短時間に複数メモのベクトルが計算された場合に、同じメモへの
  // pushを連続で送らないための簡易デバウンス(メモ単位)
  const pushTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const pullVectors = useCallback(async () => {
    try {
      const cursor = await loadVectorSyncCursor();
      const res = await api.getNoteVectors(token, cursor);
      for (const rec of res.vectors) {
        try {
          const vectors = (await decryptJson(key, rec.iv, rec.payload)) as NoteVectors;
          await putNoteVectors(rec.uid, vectors);
        } catch {
          // 復号できないレコードはスキップ(鍵不一致・破損など)
        }
      }
      await saveVectorSyncCursor(res.serverNow);
    } catch {
      // ベクトル同期の失敗はメモ本文の同期(notesStore側)には影響させない。
      // 次回のsyncNowでリトライされる
    }
  }, [token, key]);

  useEffect(() => {
    void pullVectors();

    const unsubscribe = onVectorComputed((noteId) => {
      const timers = pushTimers.current;
      const existing = timers.get(noteId);
      if (existing) clearTimeout(existing);
      timers.set(
        noteId,
        setTimeout(() => {
          timers.delete(noteId);
          void pushVectorsForNote(token, key, noteId);
        }, 1000),
      );
    });

    return () => {
      unsubscribe();
      pushTimers.current.forEach((t) => clearTimeout(t));
      pushTimers.current.clear();
    };
  }, [pullVectors, token, key]);

  return { pullVectors };
}

// ---- アカウント単位のモデル選択(4.4)。フェーズ4の切り替えUIから使う ----

/** 現在のアカウントが選択しているカタログエントリIDを取得する(未設定ならnull) */
export async function getActiveModel(token: string, key: CryptoKey): Promise<string | null> {
  const rec = await api.getActiveModel(token);
  if (!rec) return null;
  try {
    const { modelId } = await decryptJson(key, rec.iv, rec.payload);
    return modelId ?? null;
  } catch {
    return null;
  }
}

/** アカウント単位のモデル選択を更新する(全端末に同期される) */
export async function setActiveModel(
  token: string,
  key: CryptoKey,
  modelId: string,
): Promise<void> {
  const enc = await encryptJson(key, { modelId });
  await api.putActiveModel(token, enc.payload, enc.iv, Date.now());
}
