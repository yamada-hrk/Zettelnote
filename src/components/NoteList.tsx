// ============================================================
// 左カラム: メモ一覧 + ハッシュタグパネル
// - 更新日時の降順で表示
// - 「+ 新規メモ」ボタンで作成
// - タグパネル: 全メモのハッシュタグを件数付きで一覧表示し、
//   クリックでそのタグを含むメモに絞り込む(再クリックで解除)
// - すりガラス調の半透明パネル + ホバー時の輝線ボーダー(glow-card)
//
// ■ 俯瞰モード(ScrapBox 風カード表示)
//   ペイン幅が 380px を超えると、縦長リストから
//   タイル状のカードグリッドへ自動的に切り替わる(useThresholdMode)。
//   幅の情報は PanelHandle のドラッグで更新される既存の `width` prop を
//   そのまま使うため、ResizeObserver 等の追加計測は不要。
//   ヒステリシス(enter 380 / exit 340)により境界付近でのチラつきを防ぐ。
// ============================================================
import { useThresholdMode } from '../hooks/useThresholdMode';
import SyncPanel from './SyncPanel';
import type { NoteMeta } from '../types';

/** この幅を超えるとカード表示(俯瞰モード)に切り替わる */
const CARD_MODE_ENTER = 380;
/** カード表示からリスト表示に戻るしきい値(チラつき防止のヒステリシス) */
const CARD_MODE_EXIT = 340;

interface Props {
  /** パネルの幅(px)。リサイズ対応のため親から渡される */
  width: number;
  /** 表示するメモ(検索・タグ絞り込み適用済み) */
  notes: NoteMeta[];
  /** 全メモのタグ集計: [タグ名, 件数](件数降順) */
  tags: [string, number][];
  /** 現在絞り込み中のタグ(null なら全件表示) */
  tagFilter: string | null;
  currentId: number | null;
  /** 検索クエリ(入力中の生の値) */
  searchQuery: string;
  /** 検索結果表示中か(件数表示・空状態の文言に使う) */
  searchActive: boolean;
  /** タグを共有する他メモの件数(俯瞰モードのカードに「🔗 繋がり」として表示) */
  connectionCounts: Map<number, number>;
  /** 編集中メモとの AI 連想スコア(俯瞰モードのカードに関連度として表示。基準がなければ空) */
  relevanceById: Map<number, number>;
  onSearchChange: (query: string) => void;
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
  searchQuery,
  searchActive,
  connectionCounts,
  relevanceById,
  onSearchChange,
  onSelect,
  onCreate,
  onSelectTag,
}: Props) {
  const cardMode = useThresholdMode(width, CARD_MODE_ENTER, CARD_MODE_EXIT);
  return (
    // 境界線は PanelHandle 側が描画するため、ここでは border を持たない
    <aside
      style={{ width }}
      className="flex h-full shrink-0 flex-col bg-white/[0.02] backdrop-blur-xl"
    >
      {/* ヘッダー(俯瞰モード中はバッジを表示) */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <h1 className="text-sm font-bold tracking-wide text-slate-200">
          🗂️{' '}
          <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
            ツェッテルカステン
          </span>
        </h1>
        {cardMode && (
          <span
            title="ペイン幅を狭めるとリスト表示に戻ります"
            className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-violet-400/25"
          >
            🗺️ 俯瞰
          </span>
        )}
      </div>

      {/* 新規作成ボタン */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onCreate}
          className="w-full rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 hover:from-indigo-400 hover:to-indigo-500 active:scale-[0.98]"
        >
          ＋ 新規メモ
        </button>
      </div>

      {/* 検索バー: 打鍵で一覧を即絞り込み、右ペインは AI 連想結果に切り替わる */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            🔍
          </span>
          <input
            id="note-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              // Esc で検索を解除してフォーカスを外す
              if (e.key === 'Escape') {
                onSearchChange('');
                e.currentTarget.blur();
              }
            }}
            placeholder="検索 (Ctrl+K)"
            className="w-full rounded-lg bg-white/5 py-1.5 pl-8 pr-7 text-sm text-slate-200 ring-1 ring-white/10 outline-none transition-shadow placeholder:text-slate-600 focus:ring-indigo-400/50"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              title="検索を解除 (Esc)"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
        {/* 検索中は件数を表示 */}
        {searchActive && (
          <p className="mt-1.5 px-1 text-[10px] text-slate-500">
            一致 {notes.length} 件
            {tagFilter && (
              <span className="text-indigo-300/70">(#{tagFilter} 内)</span>
            )}
          </p>
        )}
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
            {searchActive ? (
              <>
                「<span className="text-slate-300">{searchQuery.trim()}</span>」
                に一致するメモはありません。
                <br />
                右の連想結果もあわせて確認してください。
              </>
            ) : tagFilter ? (
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
        {cardMode ? (
          // ---- 俯瞰モード: ScrapBox 風のカードグリッド ----
          // auto-fill + minmax によりカラム数は JS 計算なしで幅に応じて自動決定される
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {notes.map((note, i) => (
              <NoteCard
                key={note.id}
                note={note}
                rank={i}
                active={note.id === currentId}
                tagFilter={tagFilter}
                relevance={relevanceById.get(note.id)}
                connections={connectionCounts.get(note.id) ?? 0}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : (
          // ---- 通常モード: 縦長リスト ----
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
        )}
      </nav>

      {/* サーバー同期ステータス + 設定(Step2) */}
      <SyncPanel />
    </aside>
  );
}

// ------------------------------------------------------------
// 俯瞰モード用カード(ScrapBox 風パネル)
// - relevance: 編集中メモとの AI 連想スコア(算出済みの場合のみバッジ表示)
// - connections: ハッシュタグで繋がる他メモの件数
// を表示し、メモ同士の繋がりを一覧の中で俯瞰しやすくする
// ------------------------------------------------------------
function NoteCard({
  note,
  rank,
  active,
  tagFilter,
  relevance,
  connections,
  onSelect,
}: {
  note: NoteMeta;
  rank: number;
  active: boolean;
  tagFilter: string | null;
  relevance?: number;
  connections: number;
  onSelect: (id: number) => void;
}) {
  return (
    <button
      onClick={() => onSelect(note.id)}
      // 出現時に順位に応じた時間差でふわっと現れる(件数が多くても遅延は頭打ちにする)
      style={{ animationDelay: `${Math.min(rank, 24) * 15}ms` }}
      className={`glow-card rise-in flex flex-col rounded-xl p-3 text-left transition-all duration-200 ${
        active
          ? 'bg-white/[0.07] ring-1 ring-indigo-400/30'
          : 'bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`min-w-0 flex-1 truncate text-sm font-semibold ${
            active ? 'text-indigo-300' : 'text-slate-200'
          }`}
        >
          {note.title || '(無題)'}
        </h3>
        {relevance != null && (
          <span
            title="編集中のメモとの意味的な近さ(AI連想)"
            className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300"
          >
            {Math.round(relevance * 100)}%
          </span>
        )}
      </div>

      <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">
        {note.preview || '本文なし'}
      </p>

      {note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.slice(0, 4).map((t) => (
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
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
        <span>{note.updated_at}</span>
        {connections > 0 && (
          <span title={`ハッシュタグで繋がるメモが${connections}件`}>
            🔗 {connections}
          </span>
        )}
      </div>
    </button>
  );
}
