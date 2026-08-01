// ============================================================
// アプリ本体
// 3カラム構成: メモ一覧 | エディタ | レコメンドサイドバー
// - 自動保存: 入力停止 800ms 後に SQLite へ保存
// - レコメンド: 入力停止 600ms 後にバックグラウンドで類似検索
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import RecommendSidebar from './components/RecommendSidebar';
import { useDebounce } from './hooks/useDebounce';
import { useNoteHistory } from './hooks/useNoteHistory';
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
      {/* 左: メモ一覧 */}
      <NoteList
        notes={notes}
        currentId={currentId}
        onSelect={handleSelect}
        onCreate={handleCreate}
      />

      {/* 中央: エディタ */}
      <Editor
        noteId={currentId}
        title={title}
        body={body}
        saveState={saveState}
        canGoBack={history.canGoBack}
        canGoForward={history.canGoForward}
        onBack={handleBack}
        onForward={handleForward}
        onChangeTitle={handleChangeTitle}
        onChangeBody={handleChangeBody}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />

      {/* 右: リアルタイム・レコメンドサイドバー */}
      <RecommendSidebar
        result={recommend}
        searching={searching}
        onOpen={handleSelect}
      />
    </div>
  );
}
