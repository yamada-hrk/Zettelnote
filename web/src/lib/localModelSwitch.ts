// ============================================================
// ローカルモードのモデル切り替え(未ログイン体験)
//
// modelSwitch.ts の useModelSwitch と同じ戻り値の形
// ({ activeModelId, switching, progress, etaMs, switchTo }) を持つが、
// アカウント単位のサーバー同期(4.3〜4.6)は一切行わない。ローカルモードは
// 単一ブラウザで完結するため、他端末との整合を取る仕組みは不要。
// 該当モデルの埋め込みをこの端末のIndexedDB(vectorCache.ts、ログイン後と
// 共通)へ計算・キャッシュするだけのシンプルな実装
// ============================================================
import { useCallback, useState } from 'react';
import { DEFAULT_MODEL_ID, modelCatalog, warmCache } from './search';

export { modelCatalog };

export interface LocalWarmProgress {
  done: number;
  total: number;
}

export function useLocalModelSwitch(
  notes: { uid: string; title: string; body: string }[],
) {
  const [activeModelId, setActiveModelId] = useState(DEFAULT_MODEL_ID);
  const [switching, setSwitching] = useState(false);
  const [progress, setProgress] = useState<LocalWarmProgress | null>(null);
  const [etaMs, setEtaMs] = useState<number | null>(null);

  const switchTo = useCallback(
    async (modelId: string) => {
      if (modelId === activeModelId || switching) return;
      setSwitching(true);
      setProgress({ done: 0, total: notes.length });
      setEtaMs(null);
      const docs = notes.map((n) => ({ id: n.uid, title: n.title, body: n.body }));
      const startedAt = performance.now();
      await warmCache(docs, modelId, (done, total) => {
        setProgress({ done, total });
        if (done > 0) {
          const elapsedMs = performance.now() - startedAt;
          const remaining = total - done;
          setEtaMs(Math.round((elapsedMs / done) * remaining));
        }
      });
      setActiveModelId(modelId);
      setSwitching(false);
      setProgress(null);
      setEtaMs(null);
    },
    [activeModelId, switching, notes],
  );

  return { activeModelId, switching, progress, etaMs, switchTo };
}
