// ============================================================
// サイドバーのリサイズ・開閉状態を管理するフック
// (src/hooks/useResizablePanel.ts と同一ロジック)
//
// react に依存するため、useDebounce.ts と同じ理由でローカルに
// 複製している(Docker のビルドコンテキストでは web/ の外にある
// react 依存ファイルを解決できないため)
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface PanelState {
  width: number;
  collapsed: boolean;
}

interface Options {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: 'left' | 'right';
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
}: Options) {
  const clamp = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, w)),
    [minWidth, maxWidth]
  );

  const [state, setState] = useState<PanelState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PanelState>;
        if (
          typeof saved.width === 'number' &&
          typeof saved.collapsed === 'boolean'
        ) {
          return {
            width: Math.min(maxWidth, Math.max(minWidth, saved.width)),
            collapsed: saved.collapsed,
          };
        }
      }
    } catch {
      // 壊れた保存値は無視して初期レイアウトにフォールバック
    }
    return { width: defaultWidth, collapsed: false };
  });

  const [resizing, setResizing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ストレージが使えない環境では永続化なしで動作を続ける
    }
  }, [state, storageKey]);

  const startResize = useCallback(
    (e: ReactMouseEvent) => {
      if (stateRef.current.collapsed) return;
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = stateRef.current.width;
      setResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const next = clamp(side === 'left' ? startWidth + dx : startWidth - dx);
        setState((s) => (s.width === next ? s : { ...s, width: next }));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setResizing(false);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [clamp, side]
  );

  const toggle = useCallback(
    () => setState((s) => ({ ...s, collapsed: !s.collapsed })),
    []
  );

  const resetWidth = useCallback(
    () => setState((s) => ({ ...s, width: defaultWidth })),
    [defaultWidth]
  );

  return {
    width: state.width,
    collapsed: state.collapsed,
    resizing,
    startResize,
    toggle,
    resetWidth,
  };
}
