// ============================================================
// モデル切り替え中の進捗表示(4.5)
//
// プログレスバー・件数・推定残り時間の3点セットで進捗を明示する。
// ユーザー目線では処理時間を事前に予測できないことが不安の主因であり、
// 見通しを示すことの方が所要時間の短縮より効果的、という判断に基づく
// (意味的類似_埋め込みモデル導入提案.md 4.5)。
//
// RecommendPanel(デスクトップ)・MobileRecommendStrip(スマホ)の
// 両方から使う共通部品
// ============================================================
import { useTranslation } from 'react-i18next';

export default function ModelSwitchBanner({
  progress,
  etaMs,
}: {
  progress: { done: number; total: number } | null;
  etaMs: number | null;
}) {
  const { t } = useTranslation();
  if (!progress) return null;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const formatEta = (ms: number): string => {
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec < 60) return t('modelSwitch.etaSeconds', { count: totalSec });
    return t('modelSwitch.etaMinutes', { count: Math.ceil(totalSec / 60) });
  };

  return (
    <div className="border-b border-white/5 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] text-slate-400">
        {t('modelSwitch.updating', {
          done: progress.done,
          total: progress.total,
          eta:
            etaMs != null && etaMs > 0
              ? t('modelSwitch.etaSuffix', { eta: formatEta(etaMs) })
              : '',
        })}
      </p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
