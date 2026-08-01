// ============================================================
// 左カラム: メモ一覧
// - 更新日時の降順で表示
// - 「+ 新規メモ」ボタンで作成
// - すりガラス調の半透明パネル + ホバー時の輝線ボーダー(glow-card)
// ============================================================
import type { NoteMeta } from '../types';

interface Props {
  notes: NoteMeta[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
}

export default function NoteList({ notes, currentId, onSelect, onCreate }: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-white/[0.02] backdrop-blur-xl">
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

      {/* メモ一覧 */}
      <nav className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-3">
        {notes.length === 0 && (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
            メモがありません。
            <br />
            「＋ 新規メモ」から作成してください。
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
