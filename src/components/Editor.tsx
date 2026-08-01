// ============================================================
// 中央カラム: Markdown エディタ
// - タイトル + 本文(Markdown)の編集
// - 「プレビュー」トグルで marked によるレンダリング表示
// - 保存状態インジケーター(自動保存)
//
// ■ フローティング・アイランド型ツールバー
//   従来の帯状ヘッダーではなく、画面上部中央に浮かぶすりガラスの
//   「島」に操作系(戻る/進む・編集/プレビュー・保存状態・削除)を集約。
//   backdrop-blur + 半透明背景 + リング + 深いシャドウで浮遊感を出す。
// ============================================================
import { useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { SaveState } from '../App';

interface Props {
  noteId: number | null;
  title: string;
  body: string;
  saveState: SaveState;
  canGoBack: boolean;
  canGoForward: boolean;
  /** 左右サイドバーの開閉状態(ツールバーのアイコン表示用) */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onBack: () => void;
  onForward: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onChangeTitle: (v: string) => void;
  onChangeBody: (v: string) => void;
  onDelete: () => void;
  onCreate: () => void;
}

/** 保存状態 → 表示ラベル */
const SAVE_LABEL: Record<SaveState, { text: string; className: string }> = {
  idle: { text: '', className: '' },
  dirty: { text: '未保存の変更あり…', className: 'text-amber-400/90' },
  saving: { text: '保存中…', className: 'text-slate-500' },
  saved: { text: '✓ 保存済み', className: 'text-emerald-400/90' },
};

/** ツールバー内の区切り線 */
function Divider() {
  return <div className="h-5 w-px shrink-0 bg-white/10" />;
}

/** サイドバー開閉ボタンのアイコン(開いている側を塗りで示す) */
function PanelGlyph({ side, open }: { side: 'left' | 'right'; open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="block">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x={side === 'left' ? 3 : 9}
        y="4"
        width="4"
        height="8"
        rx="1"
        fill="currentColor"
        opacity={open ? 0.85 : 0.25}
      />
    </svg>
  );
}

export default function Editor({
  noteId,
  title,
  body,
  saveState,
  canGoBack,
  canGoForward,
  leftCollapsed,
  rightCollapsed,
  onBack,
  onForward,
  onToggleLeft,
  onToggleRight,
  onChangeTitle,
  onChangeBody,
  onDelete,
  onCreate,
}: Props) {
  const [preview, setPreview] = useState(false);

  // Markdown → HTML(XSS 対策として DOMPurify でサニタイズ)
  const previewHtml = useMemo(() => {
    if (!preview) return '';
    const raw = marked.parse(body, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [preview, body]);

  // メモ未選択時の空状態
  if (noteId === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-5">
        <p className="text-sm text-slate-500">メモが選択されていません</p>
        <button
          onClick={onCreate}
          className="rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 hover:from-indigo-400 hover:to-indigo-500 active:scale-[0.98]"
        >
          ＋ 最初のメモを作成する
        </button>
      </main>
    );
  }

  const save = SAVE_LABEL[saveState];

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      {/* フローティング・アイランド型ツールバー */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-6">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#12151f]/70 px-2.5 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {/* 左サイドバー(メモ一覧)の開閉 */}
          <button
            onClick={onToggleLeft}
            title="メモ一覧を開閉 (Ctrl+B)"
            aria-label="メモ一覧サイドバーを開閉"
            className="rounded-lg px-2 py-1.5 text-slate-400 transition-all duration-150 hover:bg-white/10 hover:text-slate-100"
          >
            <PanelGlyph side="left" open={!leftCollapsed} />
          </button>

          <Divider />

          {/* 戻る / 進む(閲覧履歴のナビゲーション) */}
          <div className="flex gap-0.5">
            <button
              onClick={onBack}
              disabled={!canGoBack}
              title="戻る (Alt+←)"
              aria-label="前のメモに戻る"
              className="rounded-lg px-2 py-1 text-sm text-slate-400 transition-all duration-150 enabled:hover:bg-white/10 enabled:hover:text-slate-100 enabled:active:scale-95 disabled:cursor-default disabled:text-slate-700"
            >
              ←
            </button>
            <button
              onClick={onForward}
              disabled={!canGoForward}
              title="進む (Alt+→)"
              aria-label="次のメモに進む"
              className="rounded-lg px-2 py-1 text-sm text-slate-400 transition-all duration-150 enabled:hover:bg-white/10 enabled:hover:text-slate-100 enabled:active:scale-95 disabled:cursor-default disabled:text-slate-700"
            >
              →
            </button>
          </div>

          <Divider />

          {/* 編集 / プレビュー切り替え */}
          <div className="flex rounded-xl bg-white/5 p-0.5 text-xs font-medium">
            <button
              onClick={() => setPreview(false)}
              className={`rounded-lg px-3 py-1 transition-all duration-200 ${
                !preview
                  ? 'bg-white/10 text-indigo-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              ✏️ 編集
            </button>
            <button
              onClick={() => setPreview(true)}
              className={`rounded-lg px-3 py-1 transition-all duration-200 ${
                preview
                  ? 'bg-white/10 text-indigo-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              👁 プレビュー
            </button>
          </div>

          <Divider />

          {/* 保存状態(幅を固定して島のサイズ変動を防ぐ) */}
          <span
            className={`w-28 shrink-0 truncate text-center text-[11px] transition-colors duration-300 ${save.className}`}
          >
            {save.text}
          </span>

          <Divider />

          {/* 削除 */}
          <button
            onClick={onDelete}
            className="rounded-lg px-2 py-1 text-xs text-slate-500 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400"
            title="このメモを削除"
          >
            🗑 削除
          </button>

          <Divider />

          {/* 右サイドバー(関連メモ)の開閉 */}
          <button
            onClick={onToggleRight}
            title="関連メモを開閉 (Ctrl+Shift+B)"
            aria-label="関連メモサイドバーを開閉"
            className="rounded-lg px-2 py-1.5 text-slate-400 transition-all duration-150 hover:bg-white/10 hover:text-slate-100"
          >
            <PanelGlyph side="right" open={!rightCollapsed} />
          </button>
        </div>
      </div>

      {/* タイトル(pt でフローティングツールバー分の余白を確保) */}
      <input
        value={title}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder="タイトルを入力…"
        className="border-b border-white/5 bg-transparent px-8 pb-4 pt-[4.4rem] text-2xl font-bold text-slate-100 caret-indigo-400 outline-none placeholder:text-slate-600"
      />

      {/* 本文: 編集 or プレビュー */}
      {preview ? (
        <div
          className="markdown-body thin-scrollbar flex-1 overflow-y-auto px-8 py-5"
          // marked の出力を DOMPurify でサニタイズ済み
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <textarea
          value={body}
          onChange={(e) => onChangeBody(e.target.value)}
          placeholder="ここに Markdown でメモを書く…&#10;&#10;書き始めると、右のサイドバーに関連メモがリアルタイムで表示されます。"
          className="thin-scrollbar flex-1 resize-none bg-transparent px-8 py-5 font-mono text-sm leading-relaxed text-slate-300 caret-indigo-400 outline-none placeholder:text-slate-600"
          spellCheck={false}
        />
      )}
    </main>
  );
}
