// ============================================================
// メモの閲覧履歴スタック管理フック
// (src/hooks/useNoteHistory.ts と同一ロジック。react に依存するため
// useDebounce.ts と同じ理由でローカルに複製している)
//
// デスクトップ版は SQLite の連番 id(number)を扱うが、Web版は
// サーバー同期の uid(string)が主キーのため、その差分のみ反映している
// ============================================================
import { useCallback, useRef, useState } from 'react';

interface HistoryState {
  stack: string[];
  index: number;
}

export function useNoteHistory(limit = 100) {
  const [state, setState] = useState<HistoryState>({ stack: [], index: -1 });

  // back / forward が同期的に遷移先 uid を返せるよう、最新状態をミラーしておく
  const stateRef = useRef(state);
  stateRef.current = state;

  /** メモを開いたことを履歴に記録する(戻る/進むによる遷移では呼ばない) */
  const push = useCallback(
    (uid: string) => {
      setState((s) => {
        // 同じメモの連続記録はスキップ
        if (s.stack[s.index] === uid) return s;
        // 現在位置より先(「進む」側)の履歴を破棄して追加、上限超過分は古い方から捨てる
        const stack = [...s.stack.slice(0, s.index + 1), uid].slice(-limit);
        return { stack, index: stack.length - 1 };
      });
    },
    [limit]
  );

  /** 一つ前の履歴へ戻り、その uid を返す(戻れない場合は null) */
  const back = useCallback((): string | null => {
    const s = stateRef.current;
    if (s.index <= 0) return null;
    const index = s.index - 1;
    setState({ stack: s.stack, index });
    return s.stack[index];
  }, []);

  /** 一つ先の履歴へ進み、その uid を返す(進めない場合は null) */
  const forward = useCallback((): string | null => {
    const s = stateRef.current;
    if (s.index >= s.stack.length - 1) return null;
    const index = s.index + 1;
    setState({ stack: s.stack, index });
    return s.stack[index];
  }, []);

  /** 指定 uid を履歴から取り除く(メモ削除時に呼ぶ) */
  const remove = useCallback((uid: string) => {
    setState((s) => {
      const stack = s.stack.filter((x) => x !== uid);
      // 現在位置以前から取り除かれた個数だけ index を前へ補正する
      const removedBefore = s.stack
        .slice(0, s.index + 1)
        .filter((x) => x === uid).length;
      const index = Math.min(s.index - removedBefore, stack.length - 1);
      return { stack, index };
    });
  }, []);

  return {
    push,
    back,
    forward,
    remove,
    /** これ以上戻れるか(ボタンの活性制御用) */
    canGoBack: state.index > 0,
    /** これ以上進めるか(ボタンの活性制御用) */
    canGoForward: state.index < state.stack.length - 1,
  };
}
