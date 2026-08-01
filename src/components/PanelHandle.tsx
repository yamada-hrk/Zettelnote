// ============================================================
// サイドバーの境界線ハンドル
// - ドラッグで隣接パネルの幅を変更(ホバーでカーソルが col-resize に変化)
// - 中央の小さなボタンで折りたたみ / 再展開
//   (展開中はホバー時のみ表示、折りたたみ中は常時表示)
// - ダブルクリックで既定の幅にリセット
// ============================================================
import type { MouseEvent as ReactMouseEvent } from 'react';

interface Props {
  /** どちら側のサイドバーの境界か */
  side: 'left' | 'right';
  collapsed: boolean;
  /** ドラッグ中(境界線をハイライトする) */
  resizing: boolean;
  onResizeStart: (e: ReactMouseEvent) => void;
  onToggle: () => void;
  onResetWidth: () => void;
  /** トグルボタンのツールチップに表示するショートカット表記 */
  shortcutHint: string;
}

export default function PanelHandle({
  side,
  collapsed,
  resizing,
  onResizeStart,
  onToggle,
  onResetWidth,
  shortcutHint,
}: Props) {
  // シェブロンの向き: 「押すとパネルが動く方向」を指す
  const chevron =
    side === 'left' ? (collapsed ? '›' : '‹') : collapsed ? '‹' : '›';

  return (
    <div
      className={`group relative z-30 flex h-full w-1.5 shrink-0 items-center justify-center ${
        collapsed ? '' : 'cursor-col-resize'
      }`}
      onMouseDown={collapsed ? undefined : onResizeStart}
      onDoubleClick={collapsed ? undefined : onResetWidth}
      title={collapsed ? undefined : 'ドラッグで幅を変更 / ダブルクリックで既定幅'}
    >
      {/* 境界線本体(ホバー・ドラッグ中はインディゴに発光) */}
      <div
        className={`h-full w-px transition-colors duration-150 ${
          resizing
            ? 'bg-indigo-400/70'
            : 'bg-white/5 group-hover:bg-indigo-400/50'
        }`}
      />

      {/* 開閉トグルボタン */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={onToggle}
        title={
          collapsed
            ? `サイドバーを開く (${shortcutHint})`
            : `サイドバーを折りたたむ (${shortcutHint})`
        }
        className={`absolute top-1/2 z-10 flex h-10 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-[#12151f]/85 text-[11px] text-slate-500 shadow-lg shadow-black/40 backdrop-blur-xl transition-all duration-200 hover:border-white/20 hover:text-slate-200 ${
          collapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {chevron}
      </button>
    </div>
  );
}
