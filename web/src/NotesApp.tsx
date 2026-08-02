// ============================================================
// メイン画面(Web版)
//
// v1 後に追加: サイドバーのドラッグリサイズ・開閉(useResizablePanel)、
// 左パネルを幅380px超に広げると縦長リストからカードグリッドへ自動的に
// 切り替わる俯瞰モード(useThresholdMode)。デスクトップ版と同じ判定方式
// (幅は state から直接判定、ResizeObserver は使わない)。
//
// デスクトップ版のハッシュタグパネル等のリッチな UI はまだ移植していない
// (将来の拡張ポイント)。検索(部分一致フィルタ)・関連メモ(意味的類似/
// キーワード)は electron/search.js を直接共有している。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from './hooks/useDebounce';
import { useResizablePanel } from './hooks/useResizablePanel';
import { useThresholdMode } from './hooks/useThresholdMode';
import { useNotesStore } from './lib/notesStore';
import { extractTags, keywordFilter } from './lib/search';
import RecommendPanel from './RecommendPanel';
import PanelHandle from './components/PanelHandle';
import type { Note } from './types';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

/** この幅を超えるとカード表示(俯瞰モード)に切り替わる */
const CARD_MODE_ENTER = 380;
/** カード表示からリスト表示に戻るしきい値(チラつき防止のヒステリシス) */
const CARD_MODE_EXIT = 340;

export default function NotesApp({
  token,
  username,
  cryptoKey,
  onLogout,
  onForgetKey,
}: {
  token: string;
  username: string;
  cryptoKey: CryptoKey;
  onLogout: () => void;
  /** アカウントはログインしたまま、保存済み暗号化キーだけ削除して再入力を求める */
  onForgetKey: () => void;
}) {
  const { notes, loading, error, save, remove, create } = useNotesStore(
    token,
    cryptoKey,
  );

  const leftPanel = useResizablePanel({
    storageKey: 'zettelnote-web:panel:left',
    defaultWidth: 288,
    minWidth: 200,
    maxWidth: 640,
    side: 'left',
  });
  const rightPanel = useResizablePanel({
    storageKey: 'zettelnote-web:panel:right',
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 480,
    side: 'right',
  });
  const cardMode = useThresholdMode(
    leftPanel.width,
    CARD_MODE_ENTER,
    CARD_MODE_EXIT,
  );

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 150);

  const selected = notes.find((n) => n.uid === selectedUid) ?? null;

  // 選択中のメモが変わったらエディタへ反映する
  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setBody(selected.body);
      setSaveState('idle');
    }
  }, [selected?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 一覧未選択かつメモがあれば先頭を自動選択
  useEffect(() => {
    if (!selectedUid && notes.length > 0) setSelectedUid(notes[0].uid);
  }, [notes, selectedUid]);

  const visibleNotes = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return notes;
    const docs = notes.map((n) => ({
      id: n.uid,
      title: n.title,
      body: n.body,
    }));
    const hitIds = new Set(keywordFilter(q, docs).map((d) => d.id));
    return notes.filter((n) => hitIds.has(n.uid));
  }, [notes, debouncedQuery]);

  const debouncedDraft = useDebounce({ title, body }, 800);

  // ---- 関連メモ(検索中はクエリ起点、それ以外は編集中メモ起点) ----
  // デスクトップ版と同じ役割分担: 検索クエリがあればそちらを優先する
  const recommendRaw = searchQuery.trim() ? searchQuery : `${title}\n${body}`;
  const debouncedRecommendText = useDebounce(recommendRaw, 600);
  const recommendExcludeUid = searchQuery.trim()
    ? null
    : (selected?.uid ?? null);
  const recommendDocs = useMemo(
    () => notes.map((n) => ({ uid: n.uid, title: n.title, body: n.body })),
    [notes],
  );

  // 自動保存(デスクトップ版と同じ 800ms デバウンス)
  useEffect(() => {
    if (!selected) return;
    if (
      debouncedDraft.title === selected.title &&
      debouncedDraft.body === selected.body
    )
      return;
    setSaveState('saving');
    void save(
      selected.uid,
      debouncedDraft.title,
      debouncedDraft.body,
      selected.createdAt,
    ).then(() => setSaveState('saved'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraft]);

  const handleCreate = async () => {
    const uid = await create();
    setSelectedUid(uid);
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm('このメモを削除しますか?')) return;
    await remove(selected.uid);
    setSelectedUid(null);
  };

  return (
    <div className="flex h-full">
      {/* 左: メモ一覧
          外側ラッパーの width をアニメーションさせて開閉し、
          内側は固定幅を保つことで折りたたみ中も内容が潰れない
          (デスクトップ版 App.tsx と同じパターン) */}
      <div
        className="flex shrink-0 justify-end overflow-hidden"
        style={{
          width: leftPanel.collapsed ? 0 : leftPanel.width,
          transition: leftPanel.resizing
            ? 'none'
            : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <aside
          style={{ width: leftPanel.width }}
          className="flex h-full shrink-0 flex-col bg-white/[0.02]"
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h1 className="text-sm font-bold text-slate-200">
              🗂️{' '}
              <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
                ZettelNote
              </span>
              {cardMode && (
                <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-normal text-violet-300 ring-1 ring-violet-400/25">
                  🗺️ 俯瞰
                </span>
              )}
            </h1>
            <span className="text-[10px] text-slate-500">@{username}</span>
          </div>

          <div className="px-3 pt-3 pb-2">
            <button
              onClick={() => void handleCreate()}
              className="w-full rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 hover:from-indigo-400 hover:to-indigo-500 active:scale-[0.98]"
            >
              ＋ 新規メモ
            </button>
          </div>

          <div className="px-3 pb-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="検索"
              className="w-full rounded-lg bg-white/5 px-3 py-1.5 text-sm text-slate-200 ring-1 ring-white/10 outline-none placeholder:text-slate-600 focus:ring-indigo-400/50"
            />
          </div>

          <nav className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-3">
            {loading && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                読み込み中…
              </p>
            )}
            {error && (
              <p className="mx-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400 ring-1 ring-red-500/20">
                {error}
              </p>
            )}
            {!loading && visibleNotes.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                メモがありません
              </p>
            )}
            {cardMode ? (
              // ---- 俯瞰モード: カードグリッド(カラム数は CSS が幅に応じて自動決定) ----
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                }}
              >
                {visibleNotes.map((note) => (
                  <NoteCard
                    key={note.uid}
                    note={note}
                    active={note.uid === selectedUid}
                    onSelect={setSelectedUid}
                  />
                ))}
              </div>
            ) : (
              // ---- 通常モード: 縦長リスト ----
              <ul className="space-y-1">
                {visibleNotes.map((note) => {
                  const active = note.uid === selectedUid;
                  const tags = extractTags(note.body);
                  return (
                    <li key={note.uid}>
                      <button
                        onClick={() => setSelectedUid(note.uid)}
                        className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${
                          active
                            ? 'bg-white/[0.07] ring-1 ring-white/10'
                            : 'ring-1 ring-transparent hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className={`truncate text-sm font-medium ${active ? 'text-indigo-300' : 'text-slate-300'}`}
                        >
                          {note.title || '(無題)'}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {note.body.slice(0, 60) || '本文なし'}
                        </div>
                        {tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-white/5 px-1 py-px text-[9px] text-slate-500"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <div className="space-y-0.5 border-t border-white/5 px-3 py-2">
            <button
              onClick={onForgetKey}
              title="このブラウザに保存した暗号化キーを削除し、次回アンロック画面で再入力を求めます"
              className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
            >
              🔒 キーの記憶を削除
            </button>
            <button
              onClick={onLogout}
              className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
            >
              ログアウト
            </button>
          </div>
        </aside>
      </div>

      {/* 左パネルの境界線(ドラッグリサイズ + 開閉トグル) */}
      <PanelHandle
        side="left"
        collapsed={leftPanel.collapsed}
        resizing={leftPanel.resizing}
        onResizeStart={leftPanel.startResize}
        onToggle={leftPanel.toggle}
        onResetWidth={leftPanel.resetWidth}
      />

      {/* 右: エディタ */}
      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center gap-3 border-b border-white/5 px-5 py-2">
              <span className="text-xs text-slate-500">
                {saveState === 'saving'
                  ? '保存中…'
                  : saveState === 'saved'
                    ? '✓ 保存済み'
                    : ''}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => void handleDelete()}
                className="rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                🗑 削除
              </button>
            </div>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaveState('dirty');
              }}
              placeholder="タイトルを入力…"
              className="border-b border-white/5 bg-transparent px-6 py-4 text-xl font-bold text-slate-100 outline-none placeholder:text-slate-600"
            />
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setSaveState('dirty');
              }}
              placeholder="ここに Markdown でメモを書く…"
              className="thin-scrollbar flex-1 resize-none bg-transparent px-6 py-4 font-mono text-sm leading-relaxed text-slate-300 outline-none placeholder:text-slate-600"
              spellCheck={false}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            メモが選択されていません
          </div>
        )}
      </main>

      {/* 右パネルの境界線(ドラッグリサイズ + 開閉トグル) */}
      <PanelHandle
        side="right"
        collapsed={rightPanel.collapsed}
        resizing={rightPanel.resizing}
        onResizeStart={rightPanel.startResize}
        onToggle={rightPanel.toggle}
        onResetWidth={rightPanel.resetWidth}
      />

      {/* 右: 関連メモ(意味的類似 / キーワード) */}
      <div
        className="flex shrink-0 overflow-hidden"
        style={{
          width: rightPanel.collapsed ? 0 : rightPanel.width,
          transition: rightPanel.resizing
            ? 'none'
            : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <RecommendPanel
          width={rightPanel.width}
          queryText={debouncedRecommendText}
          excludeUid={recommendExcludeUid}
          docs={recommendDocs}
          onOpen={setSelectedUid}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 俯瞰モード用カード(ScrapBox 風パネル)。デスクトップ版 NoteCard の
// v1 相当(タイトル・抜粋・タグのみ。関連度/繋がりバッジは省略)
// ------------------------------------------------------------
function NoteCard({
  note,
  active,
  onSelect,
}: {
  note: Note;
  active: boolean;
  onSelect: (uid: string) => void;
}) {
  const tags = extractTags(note.body);
  return (
    <button
      onClick={() => onSelect(note.uid)}
      className={`flex flex-col rounded-xl p-3 text-left transition-all duration-200 ${
        active
          ? 'bg-white/[0.07] ring-1 ring-indigo-400/30'
          : 'bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-white/[0.05]'
      }`}
    >
      <h3
        className={`truncate text-sm font-semibold ${active ? 'text-indigo-300' : 'text-slate-200'}`}
      >
        {note.title || '(無題)'}
      </h3>
      <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">
        {note.body || '本文なし'}
      </p>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded bg-white/5 px-1 py-px text-[9px] text-slate-500"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
