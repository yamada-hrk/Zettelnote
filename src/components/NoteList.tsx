// ============================================================
// 左カラム: メモ一覧 + ハッシュタグパネル
// - 更新日時の降順で表示
// - 「+ 新規メモ」ボタンで作成
// - タグパネル: 全メモのハッシュタグを件数付きで一覧表示し、
//   クリックでそのタグを含むメモに絞り込む(再クリックで解除)
// - すりガラス調の半透明パネル + ホバー時の輝線ボーダー(glow-card)
// ============================================================
import type { NoteMeta } from '../types';

interface Props {
  /** パネルの幅(px)。リサイズ対応のため親から渡される */
  width: number;
  /** 表示するメモ(タグ絞り込み適用済み) */
  notes: NoteMeta[];
  /** 全メモのタグ集計: [タグ名, 件数](件数降順) */
  tags: [string, number][];
  /** 現在絞り込み中のタグ(null なら全件表示) */
  tagFilter: string | null;
  currentId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  /** タグの選択/解除(null で解除) */
  onSelectTag: (tag: string | null) => void;
}

export default function NoteList({
  width,
  notes,
  tags,
  tagFilter,
  currentId,
  onSelect,
  onCreate,
  onSelectTag,
}: Props) {
  return (
    // 境界線は PanelHandle 側が描画するため、ここでは border を持たない
    <aside
      style={{ width }}
      className="flex h-full shrink-0 flex-col bg-white/[0.02] backdrop-blur-xl"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <h1 className="text-sm font-bold tracking-wide text-slate-200">
          🗂️{' '}
          <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
            ツェッテルカステン
          </span>
        </h1>
      </div>

      {/* 新規作成ボタン */}
      <div className="px-3 py-3">
        <button
          onClick={onCreate}
          className="w-full rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 hover:from-indigo-400 hover:to-indigo-500 active:scale-[0.98]"
        >
          ＋ 新規メモ
        </button>
      </div>

      {/* タグパネル */}
      {tags.length > 0 && (
        <div className="border-b border-white/5 px-3 pb-3">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              # タグ
            </span>
            {/* 絞り込み中のみ解除ボタンを表示 */}
            {tagFilter && (
              <button
                onClick={() => onSelectTag(null)}
                className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
              >
                解除 ×
              </button>
            )}
          </div>
          <div className="thin-scrollbar flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {tags.map(([tag, count]) => {
              const active = tag === tagFilter;
              return (
                <button
                  key={tag}
                  onClick={() => onSelectTag(tag)}
                  title={
                    active ? '絞り込みを解除' : `#${tag} のメモに絞り込む`
                  }
                  className={`rounded-full px-2 py-0.5 text-[11px] transition-all duration-200 ${
                    active
                      ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/40 shadow-[0_0_10px] shadow-indigo-500/20'
                      : 'bg-white/5 text-slate-400 ring-1 ring-transparent hover:bg-white/10 hover:text-slate-200'
                  }`}
                >
                  #{tag}
                  <span
                    className={`ml-1 ${active ? 'text-indigo-300/70' : 'text-slate-600'}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* メモ一覧 */}
      <nav className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-3 pt-2">
        {notes.length === 0 && (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
            {tagFilter ? (
              <>
                <span className="text-indigo-300">#{tagFilter}</span>{' '}
                のメモはありません。
              </>
            ) : (
              <>
                メモがありません。
                <br />
                「＋ 新規メモ」から作成してください。
              </>
            )}
          </p>
        )}
        <ul className="space-y-1">
          {notes.map((note) => {
            const active = note.id === currentId;
            return (
              <li key={note.id}>
                <button
                  onClick={() => onSelect(note.id)}
                  className={`glow-card w-full rounded-xl px-3 py-2 text-left transition-all duration-200 ${
                    active
                      ? 'bg-white/[0.07] ring-1 ring-white/10'
                      : 'ring-1 ring-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <div
                    className={`truncate text-sm font-medium transition-colors ${
                      active ? 'text-indigo-300' : 'text-slate-300'
                    }`}
                  >
                    {note.title || '(無題)'}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {note.preview || '本文なし'}
                  </div>
                  {/* メモが持つタグ(最大3件 + 残数) */}
                  {note.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {note.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className={`rounded px-1 py-px text-[9px] ${
                            t === tagFilter
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'bg-white/5 text-slate-500'
                          }`}
                        >
                          #{t}
                        </span>
                      ))}
                      {note.tags.length > 3 && (
                        <span className="text-[9px] text-slate-600">
                          +{note.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-slate-600">
                    {note.updated_at}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
