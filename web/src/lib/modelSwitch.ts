// ============================================================
// 意味的類似のモデル選択・切り替え(フェーズ4)
//
// 意味的類似_埋め込みモデル導入提案.md 4.3〜4.5 の設計:
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
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_MODEL_ID, modelCatalog, warmCache } from './search';
import { getActiveModel, setActiveModel } from './vectorSync';

export { modelCatalog };

export interface WarmProgress {
  done: number;
  total: number;
}

export function useModelSwitch(
  token: string,
  key: CryptoKey,
  notes: { uid: string; title: string; body: string }[],
) {
  const [activeModelId, setActiveModelIdState] = useState(DEFAULT_MODEL_ID);
  const [switching, setSwitching] = useState(false);
  const [progress, setProgress] = useState<WarmProgress | null>(null);
  const [etaMs, setEtaMs] = useState<number | null>(null);
  const startedInitialCheck = useRef(false);

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

  // 起動時: アカウントの選択モデルを読み込み、取りこぼしがあれば回収する(4.3)
  useEffect(() => {
    if (notes.length === 0 || startedInitialCheck.current) return;
    startedInitialCheck.current = true;
    (async () => {
      const stored = await getActiveModel(token, key);
      const modelId = stored ?? DEFAULT_MODEL_ID;
      setActiveModelIdState(modelId);
      await runWarmCache(modelId, notes);
    })();
  }, [token, key, notes, runWarmCache]);

  /** ユーザーの明示操作でモデルを切り替える(4.4) */
  const switchTo = useCallback(
    async (modelId: string) => {
      if (modelId === activeModelId || switching) return;
      await setActiveModel(token, key, modelId);
      setActiveModelIdState(modelId);
      await runWarmCache(modelId, notes);
    },
    [activeModelId, switching, notes, token, key, runWarmCache],
  );

  return { activeModelId, switching, progress, etaMs, switchTo };
}
