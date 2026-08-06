// ============================================================
// 意味的類似のモデル選択・切り替え(フェーズ4・5)
//
// 意味的類似_埋め込みモデル導入提案.md 4.3〜4.6 の設計:
//   - モデル選択はアカウント単位。切り替えはユーザーの明示操作のみ
//     (自動では走らない)
//   - 切り替え時は全メモを対象に一括再計算し、進捗
//     (件数・プログレスバー・推定残り時間)を画面に明示する
//   - 起動時にも同じ判定(4.1のforBodyHash/カタログエントリID一致)を
//     1回流し、前回中断した再計算の続きを自動的に拾う(取りこぼし回収)。
//     warmCache() 自体が「既にキャッシュ済みなら何もしない」ため、
//     取りこぼしが無ければこのチェックはほぼ無コストで終わる
//   - 影響範囲は「意味的類似」機能のみ。編集・保存・キーワード検索は
//     ブロックしない
//   - 切り替え後は猶予期間の間、旧モデルのベクトル・モデル本体を
//     保持しロールバックに備える(4.6)。猶予期間経過後にまとめて
//     後片付けする
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_MODEL_ID, modelCatalog, warmCache } from './search';
import { getActiveModel, setActiveModel, pushVectorsForNote } from './vectorSync';
import {
  getPendingCleanup,
  setPendingCleanup,
  clearPendingCleanup,
  removeModelFromAllNotes,
} from './vectorCache';
import * as catalogImpl from '../../../electron/embeddingCatalog.js';

export { modelCatalog };

/**
 * ロールバック猶予期間。この間は旧モデルのベクトル・モデル本体を
 * 保持し、即座に戻せるようにする(4.6)。切り替えは頻繁なトグルでは
 * なく熟考した上でのユーザー操作という前提のため、24時間としている
 */
export const CLEANUP_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface WarmProgress {
  done: number;
  total: number;
}

/** モデル本体のブラウザキャッシュ(Cache Storage)から指定モデル分を削除する */
async function evictModelBinary(modelId: string): Promise<void> {
  const entry = (catalogImpl as any).getCatalogEntry(modelId);
  const modelRepo: string | undefined = entry?.modelRepo;
  if (!modelRepo) return; // バイグラム等、ダウンロードするモデル本体を持たないエントリは対象外
  try {
    const cache = await caches.open('transformers-cache');
    const requests = await cache.keys();
    await Promise.all(
      requests.filter((r) => r.url.includes(modelRepo)).map((r) => cache.delete(r)),
    );
  } catch {
    // Cache Storageが使えない環境でも致命的ではない(次回また容量を使うだけ)
  }
}

export function useModelSwitch(
  token: string,
  key: CryptoKey,
  notes: { uid: string; title: string; body: string }[],
  /**
   * useVectorSync().pullVectors。後片付け(トリミング+Push)の前に
   * 必ずPullを完了させ、サーバー側の古い(トリミング前の)データで
   * 上書きされないようにするため、呼び出し元から明示的に受け取る
   * (useVectorSyncとuseModelSwitchは別フックのため、実行順序を
   * 保証するにはこう繋ぐ必要がある)
   */
  pullVectors: () => Promise<void>,
) {
  const [activeModelId, setActiveModelIdState] = useState(DEFAULT_MODEL_ID);
  const [switching, setSwitching] = useState(false);
  const [progress, setProgress] = useState<WarmProgress | null>(null);
  const [etaMs, setEtaMs] = useState<number | null>(null);
  const startedInitialCheck = useRef(false);
  const startedCleanupCheck = useRef(false);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const runWarmCache = useCallback(
    async (modelId: string, targetNotes: { uid: string; title: string; body: string }[]) => {
      setSwitching(true);
      setProgress({ done: 0, total: targetNotes.length });
      setEtaMs(null);
      const docs = targetNotes.map((n) => ({ id: n.uid, title: n.title, body: n.body }));
      const startedAt = performance.now();
      await warmCache(docs, modelId, (done, total) => {
        setProgress({ done, total });
        if (done > 0) {
          const elapsedMs = performance.now() - startedAt;
          const remaining = total - done;
          setEtaMs(Math.round((elapsedMs / done) * remaining));
        }
      });
      setSwitching(false);
      setProgress(null);
      setEtaMs(null);
    },
    [],
  );

  /** 猶予期間が過ぎた掃除待ちがあれば実行する(4.6) */
  const runPendingCleanupIfDue = useCallback(async () => {
    const pending = await getPendingCleanup();
    if (!pending) return;
    if (Date.now() - pending.switchedAt < CLEANUP_GRACE_PERIOD_MS) return;

    // サーバー側の最新状態を先に取り込んでおく(このPullより後に
    // ローカルで行うトリミングが、古いサーバーデータの取り込みで
    // 上書きされてしまう競合を避けるため)
    await pullVectors();

    const noteIds = notesRef.current.map((n) => n.uid);
    const changedNoteIds = await removeModelFromAllNotes(pending.previousModelId, noteIds);
    for (const noteId of changedNoteIds) {
      await pushVectorsForNote(token, key, noteId);
    }
    await evictModelBinary(pending.previousModelId);
    await clearPendingCleanup();
  }, [token, key, pullVectors]);

  // 起動時: アカウントの選択モデルを読み込み、取りこぼしがあれば回収する(4.3)
  useEffect(() => {
    if (notes.length === 0 || startedInitialCheck.current) return;
    startedInitialCheck.current = true;
    (async () => {
      // サーバー側に既に計算済みのベクトルがあれば先に取り込んでおく。
      // これを待たずにwarmCacheのキャッシュ判定を走らせると、新しい
      // 端末(ローカルIndexedDBが空)では「まだPullが終わっていないので
      // 全件キャッシュミス」という誤判定になり、他端末が既に計算済みの
      // ベクトルを再利用できず、常に一から全件再計算してしまう
      // (実際に負荷試験で発生していたバグ。4.6の後片付け処理側では
      // 同種の競合を先に修正済みだったが、こちらの起動時チェックには
      // 同じ修正が漏れていた)
      await pullVectors();

      const stored = await getActiveModel(token, key);
      const modelId = stored ?? DEFAULT_MODEL_ID;
      setActiveModelIdState(modelId);
      await runWarmCache(modelId, notes);
    })();
  }, [token, key, notes, runWarmCache, pullVectors]);

  // 起動時: 前回の切り替えから猶予期間が過ぎていれば後片付けする(4.6)
  useEffect(() => {
    if (notes.length === 0 || startedCleanupCheck.current) return;
    startedCleanupCheck.current = true;
    void runPendingCleanupIfDue();
  }, [notes, runPendingCleanupIfDue]);

  /** ユーザーの明示操作でモデルを切り替える(4.4) */
  const switchTo = useCallback(
    async (modelId: string) => {
      if (modelId === activeModelId || switching) return;
      const previousModelId = activeModelId;
      await setActiveModel(token, key, modelId);
      setActiveModelIdState(modelId);
      await runWarmCache(modelId, notes);

      // 旧モデルがキャッシュを持つエントリだった場合のみ、掃除待ちとして記録する
      // (バイグラムから切り替えた場合は何も掃除するものが無い)
      const previousEntry = (catalogImpl as any).getCatalogEntry(previousModelId);
      if (previousEntry?.needsCache) {
        await setPendingCleanup(previousModelId);
      }
    },
    [activeModelId, switching, notes, token, key, runWarmCache],
  );

  return { activeModelId, switching, progress, etaMs, switchTo };
}
