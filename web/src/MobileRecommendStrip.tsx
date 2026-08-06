// ============================================================
// スマホ表示: 編集/プレビュー画面下部の帯パネル
//
// 以前は「🔗 関連」ボタンで別画面(全画面)に遷移していたが、都度画面を
// 切り替えずに常時参照できるよう、横スクロールのコンパクト一覧として
// 画面下部に常駐させている。検索ロジックは useRecommend フックで
// RecommendPanel(デスクトップのサイドバー)と共通
// ============================================================
import { useRecommend } from './hooks/useRecommend';
import ModelSwitchBanner from './components/ModelSwitchBanner';

export default function MobileRecommendStrip({
  queryText,
  excludeUid,
  docs,
  onOpen,
  modelId,
  switchProgress,
  switchEtaMs,
}: {
  queryText: string;
  excludeUid: string | null;
  docs: { uid: string; title: string; body: string }[];
  onOpen: (uid: string) => void;
  /** 現在アカウントが選択している意味的類似のモデル(4.4) */
  modelId?: string;
  /** モデル切り替え中の進捗(4.5)。nullなら非表示 */
  switchProgress?: { done: number; total: number } | null;
  switchEtaMs?: number | null;
}) {
  const { mode, setMode, items, vectorLoading } = useRecommend(
    queryText,
    excludeUid,
    docs,
    modelId,
  );
  const loading = mode === 'vector' && vectorLoading;

  return (
    <div className="shrink-0 border-t border-white/5 bg-white/[0.02]">
      <ModelSwitchBanner progress={switchProgress ?? null} etaMs={switchEtaMs ?? null} />
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="shrink-0 text-[11px] font-bold text-slate-400">
          🔗 関連
        </span>
        <div className="flex rounded-lg bg-white/5 p-0.5 text-[11px] font-medium">
          <button
            onClick={() => setMode('vector')}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              mode === 'vector'
                ? 'bg-white/10 text-indigo-300'
                : 'text-slate-500'
            }`}
          >
            ✨ 意味的類似
          </button>
          <button
            onClick={() => setMode('keyword')}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              mode === 'keyword'
                ? 'bg-white/10 text-indigo-300'
                : 'text-slate-500'
            }`}
          >
            🔤 キーワード
          </button>
        </div>
      </div>

      <div className="relative">
        {/* ローディング中も前回の結果は消さずそのまま裏に残し、
            半透明のオーバーレイ+スピナーを重ねる(画面のちらつき防止) */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#0b0d14]/70 text-[11px] text-slate-400 backdrop-blur-[1px]">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
            <span>計算中…</span>
          </div>
        )}
        {items.length === 0 ? (
          <p className="px-3 py-3 text-center text-[11px] leading-relaxed text-slate-500">
            {queryText.trim()
              ? '関連するメモは見つかりませんでした。'
              : 'メモを書き始めると、ここに関連メモが表示されます。'}
          </p>
        ) : (
          <ul className="thin-scrollbar flex gap-2 overflow-x-auto px-3 py-2.5">
            {items.map((item) => (
              <li key={item.uid} className="shrink-0">
                <button
                  onClick={() => onOpen(item.uid)}
                  className="flex w-40 flex-col items-start gap-1.5 rounded-xl bg-white/[0.04] p-2.5 text-left ring-1 ring-white/[0.07] active:scale-[0.98]"
                >
                  <span className="line-clamp-2 text-xs font-semibold text-slate-200">
                    {item.title}
                  </span>
                  <div className="flex w-full items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400"
                        style={{
                          width: `${Math.round(Math.min(Math.max(item.score, 0), 1) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[9px] tabular-nums text-slate-500">
                      {Math.round(Math.min(Math.max(item.score, 0), 1) * 100)}%
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
