// ============================================================
// 意味的類似モデルの選択画面(4.4)
//
// モデルの切り替えは、アプリ更新にともなう自動移行ではなく
// ユーザーの明示操作をトリガーとする。切り替えは全メモの一括再計算
// (数十秒〜数分かかりうる)を伴うため、選択直後に確認を挟む
// ============================================================
import { modelCatalog } from '../lib/modelSwitch';

export default function ModelSettingsModal({
  mode,
  activeModelId,
  switching,
  onSelect,
  onClose,
}: {
  /** ローカルモードにはアカウント・他端末が存在しないため説明文を出し分ける */
  mode: 'account' | 'local';
  activeModelId: string;
  switching: boolean;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#12141f] p-5 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold text-slate-200">🧠 意味的類似のモデル</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {mode === 'account'
            ? '切り替えると、このアカウントの全端末に反映され、全メモの再計算が始まります。'
            : '切り替えると、この端末上で全メモの再計算が始まります(ローカルモードのため他端末には影響しません)。'}
        </p>

        <ul className="mt-4 space-y-2">
          {modelCatalog.map((m) => {
            const isActive = m.id === activeModelId;
            return (
              <li key={m.id}>
                <button
                  disabled={switching}
                  onClick={() => {
                    if (isActive) return;
                    if (
                      confirm(
                        `「${m.label}」に切り替えますか?\n全メモの再計算が始まります(モデルによっては数十秒〜数分かかります)。`,
                      )
                    ) {
                      onSelect(m.id);
                    }
                  }}
                  className={`w-full rounded-xl p-3 text-left ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isActive
                      ? 'bg-indigo-500/10 ring-indigo-400/40'
                      : 'bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">{m.label}</span>
                    {isActive && (
                      <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300">
                        使用中
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.description}</p>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
