// ============================================================
// アプリ本体
// 3カラム構成: メモ一覧 | エディタ | レコメンドサイドバー
// - 自動保存: 入力停止 800ms 後に SQLite へ保存
// - レコメンド: 入力停止 600ms 後にバックグラウンドで類似検索
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import RecommendSidebar from './components/RecommendSidebar';
import PanelHandle from './components/PanelHandle';
import { useDebounce } from './hooks/useDebounce';
import { useNoteHistory } from './hooks/useNoteHistory';
import { useResizablePanel } from './hooks/useResizablePanel';
import type { Note, NoteMeta, RecommendResult } from './types';

/** 保存状態の表示用 */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

export default function App() {
  // ---- メモ一覧・選択状態 ----
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // ---- レコメンド状態 ----
  const [recommend, setRecommend] = useState<RecommendResult>({
    vector: [],
    keyword: [],
  });
  const [searching, setSearching] = useState(false);

  // ---- 閲覧履歴(戻る / 進む) ----
  const history = useNoteHistory();

  // ---- サイドバーのリサイズ・開閉(localStorage に永続化) ----
  const leftPanel = useResizablePanel({
    storageKey: 'zk:panel:left',
    defaultWidth: 256,
    minWidth: 200,
    maxWidth: 400,
    side: 'left',
  });
  const rightPanel = useResizablePanel({
    storageKey: 'zk:panel:right',
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 480,
    side: 'right',
  });

  // ---- ハッシュタグ絞り込み ----
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  /** 全メモのタグ集計: [タグ名, 件数] を件数降順(同数は名前順)で返す */
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      for (const t of n.tags) map.set(t, (map.get(t) || 0) + 1);
    }
    return [...map.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja')
    );
  }, [notes]);

  /** タグ絞り込み後の一覧(未選択なら全件) */
  const visibleNotes = useMemo(
    () => (tagFilter ? notes.filter((n) => n.tags.includes(tagFilter)) : notes),
    [notes, tagFilter]
  );

  /** タグの選択/解除(同じタグを再クリックで解除) */
  const handleSelectTag = useCallback((tag: string | null) => {
    setTagFilter((cur) => (tag === null || cur === tag ? null : tag));
  }, []);

  // 絞り込み中のタグがどのメモからも消えたら自動解除する
  useEffect(() => {
    if (tagFilter && !notes.some((n) => n.tags.includes(tagFilter))) {
      setTagFilter(null);
    }
  }, [notes, tagFilter]);

  // ユーザーが編集したかどうか(選択切替時の誤保存を防ぐ)
  const dirtyRef = useRef(false);
  // 最新の編集内容(ノート切替時のフラッシュ保存に使う)
  const latestRef = useRef({ id: null as number | null, title: '', body: '' });
  latestRef.current = { id: currentId, title, body };

  // デバウンス値(保存: 800ms / レコメンド: 600ms)
  const debouncedForSave = useDebounce({ title, body }, 800);
  const debouncedForSearch = useDebounce({ title, body }, 600);

  // ---- 一覧の再読込 ----
  const refreshList = useCallback(async () => {
    setNotes(await window.api.listNotes());
  }, []);

  // ---- 初期化: 一覧を読み込み、先頭のメモを開く ----
  useEffect(() => {
    (async () => {
      const list = await window.api.listNotes();
      setNotes(list);
      if (list.length > 0) {
        const note = await window.api.getNote(list[0].id);
        if (note) {
          applyNote(note);
          history.push(note.id); // 最初に開いたメモも履歴の起点として記録
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 取得したメモをエディタに反映する(dirty フラグは立てない) */
  function applyNote(note: Note) {
    dirtyRef.current = false;
    setCurrentId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setSaveState('idle');
  }

  /** 未保存の編集内容を即時保存する(ノート切替・削除の前に呼ぶ) */
  const flushSave = useCallback(async () => {
    const { id, title, body } = latestRef.current;
    if (dirtyRef.current && id !== null) {
      await window.api.updateNote(id, { title, body });
      dirtyRef.current = false;
    }
  }, []);

  // ---- 自動保存(デバウンス後) ----
  useEffect(() => {
    if (!dirtyRef.current || currentId === null) return;
    (async () => {
      setSaveState('saving');
      await window.api.updateNote(currentId, {
        title: debouncedForSave.title,
        body: debouncedForSave.body,
      });
      dirtyRef.current = false;
      setSaveState('saved');
      await refreshList(); // 一覧のタイトル・更新日時を最新化
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedForSave]);

  // ---- レコメンド検索(デバウンス後・バックグラウンド実行) ----
  useEffect(() => {
    const text = `${debouncedForSearch.title}\n${debouncedForSearch.body}`;
    if (!text.trim()) {
      setRecommend({ vector: [], keyword: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      setSearching(true);
      const result = await window.api.recommend({
        excludeId: currentId,
        text,
      });
      // 古い検索結果で新しい結果を上書きしない
      if (!cancelled) {
        setRecommend(result);
        setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedForSearch, currentId]);

  // ---- 各操作ハンドラ ----

  /**
   * 指定 ID のメモを開く
   * @param record true なら履歴に記録する(戻る/進むによる遷移では false)
   */
  const openNote = useCallback(
    async (id: number, record: boolean) => {
      await flushSave(); // 切替前に未保存分を保存
      const note = await window.api.getNote(id);
      if (note) {
        applyNote(note);
        if (record) history.push(note.id);
      } else {
        // 履歴に残っていたが既に存在しないメモは取り除く
        history.remove(id);
      }
      await refreshList();
    },
    [flushSave, refreshList, history.push, history.remove]
  );

  /** メモを選択して開く(一覧・関連メモからのジャンプ) */
  const handleSelect = useCallback(
    async (id: number) => {
      if (id === latestRef.current.id) return;
      await openNote(id, true);
    },
    [openNote]
  );

  /** 新規メモを作成して開く */
  const handleCreate = useCallback(async () => {
    await flushSave();
    const note = await window.api.createNote();
    applyNote(note);
    history.push(note.id);
    await refreshList();
  }, [flushSave, refreshList, history.push]);

  /** 履歴を一つ戻る */
  const handleBack = useCallback(async () => {
    const id = history.back();
    if (id !== null) await openNote(id, false);
  }, [history.back, openNote]);

  /** 履歴を一つ進む */
  const handleForward = useCallback(async () => {
    const id = history.forward();
    if (id !== null) await openNote(id, false);
  }, [history.forward, openNote]);

  // ---- キーボードショートカット: Alt+← で戻る / Alt+→ で進む ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void handleBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void handleForward();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBack, handleForward]);

  // ---- サーバー同期: リモート変更を取り込んだら一覧・表示中メモを最新化 ----
  useEffect(() => {
    const unsubscribe = window.api.onSyncStatus((status) => {
      if (status.syncing || !status.configured || status.lastError) return;
      if (!status.pulled) return;
      void (async () => {
        await refreshList();
        const cur = latestRef.current.id;
        if (cur === null || dirtyRef.current) return; // 編集中は上書きしない
        const note = await window.api.getNote(cur);
        if (note) {
          // 表示中メモがリモートで更新されていた場合は内容を差し替える
          setTitle(note.title);
          setBody(note.body);
        } else {
          // 表示中メモがリモートで削除されていた場合
          history.remove(cur);
          const list = await window.api.listNotes();
          setNotes(list);
          if (list.length > 0) {
            const next = await window.api.getNote(list[0].id);
            if (next) {
              applyNote(next);
              history.push(next.id);
            }
          } else {
            setCurrentId(null);
            setTitle('');
            setBody('');
            setSaveState('idle');
          }
        }
      })();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshList, history.remove, history.push]);

  // ---- キーボードショートカット: Ctrl+B 左パネル / Ctrl+Shift+B 右パネル ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      if (e.shiftKey) {
        rightPanel.toggle();
      } else {
        leftPanel.toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leftPanel.toggle, rightPanel.toggle]);

  /** 現在のメモを削除する */
  const handleDelete = useCallback(async () => {
    if (currentId === null) return;
    if (!window.confirm('このメモを削除しますか?')) return;
    dirtyRef.current = false;
    await window.api.deleteNote(currentId);
    history.remove(currentId); // 削除済みメモを履歴からも取り除く
    const list = await window.api.listNotes();
    setNotes(list);
    if (list.length > 0) {
      const note = await window.api.getNote(list[0].id);
      if (note) {
        applyNote(note);
        history.push(note.id);
      }
    } else {
      setCurrentId(null);
      setTitle('');
      setBody('');
      setSaveState('idle');
    }
  }, [currentId, history.remove, history.push]);

  /** タイトル編集 */
  const handleChangeTitle = (v: string) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setTitle(v);
  };

  /** 本文編集 */
  const handleChangeBody = (v: string) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setBody(v);
  };

  return (
    // 背景色は body 側(index.css)のダークグラデーションに任せる
    <div className="flex h-full text-slate-300">
      {/* 左: メモ一覧 + タグパネル
          外側ラッパーの width をアニメーションさせて開閉し、
          内側は固定幅を保つことで折りたたみ中も内容が潰れない */}
      <div
        className="flex shrink-0 justify-end overflow-hidden"
        style={{
          width: leftPanel.collapsed ? 0 : leftPanel.width,
          transition: leftPanel.resizing
            ? 'none'
            : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <NoteList
          width={leftPanel.width}
          notes={visibleNotes}
          tags={tagCounts}
          tagFilter={tagFilter}
          currentId={currentId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onSelectTag={handleSelectTag}
        />
      </div>

      {/* 左パネルの境界線(ドラッグリサイズ + 開閉トグル) */}
      <PanelHandle
        side="left"
        collapsed={leftPanel.collapsed}
        resizing={leftPanel.resizing}
        onResizeStart={leftPanel.startResize}
        onToggle={leftPanel.toggle}
        onResetWidth={leftPanel.resetWidth}
        shortcutHint="Ctrl+B"
      />

      {/* 中央: エディタ */}
      <Editor
        noteId={currentId}
        title={title}
        body={body}
        saveState={saveState}
        canGoBack={history.canGoBack}
        canGoForward={history.canGoForward}
        leftCollapsed={leftPanel.collapsed}
        rightCollapsed={rightPanel.collapsed}
        onBack={handleBack}
        onForward={handleForward}
        onToggleLeft={leftPanel.toggle}
        onToggleRight={rightPanel.toggle}
        onChangeTitle={handleChangeTitle}
        onChangeBody={handleChangeBody}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />

      {/* 右パネルの境界線(ドラッグリサイズ + 開閉トグル) */}
      <PanelHandle
        side="right"
        collapsed={rightPanel.collapsed}
        resizing={rightPanel.resizing}
        onResizeStart={rightPanel.startResize}
        onToggle={rightPanel.toggle}
        onResetWidth={rightPanel.resetWidth}
        shortcutHint="Ctrl+Shift+B"
      />

      {/* 右: リアルタイム・レコメンドサイドバー */}
      <div
        className="flex shrink-0 overflow-hidden"
        style={{
          width: rightPanel.collapsed ? 0 : rightPanel.width,
          transition: rightPanel.resizing
            ? 'none'
            : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <RecommendSidebar
          width={rightPanel.width}
          result={recommend}
          searching={searching}
          onOpen={handleSelect}
        />
      </div>
    </div>
  );
}
