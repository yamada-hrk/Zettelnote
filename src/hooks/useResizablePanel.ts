// ============================================================
// サイドバーのリサイズ・開閉状態を管理するフック
// - ドラッグによる幅変更(最小/最大幅でクランプ)
// - 折りたたみトグル(折りたたんでも直前の幅は保持される)
// - localStorage への永続化(再起動してもレイアウトを復元)
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface PanelState {
  /** 展開時の幅(px)。折りたたみ中も保持され、再展開時に復元される */
  width: number;
  collapsed: boolean;
}

interface Options {
  /** localStorage の保存キー */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /**
   * パネルの位置。ドラッグ方向と幅の増減の対応を決める
   * ('left' = 右へドラッグで拡大 / 'right' = 左へドラッグで拡大)
   */
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

  // 初期値: localStorage に保存済みのレイアウトがあれば復元する
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

  /** ドラッグ中かどうか(ドラッグ中は幅の transition を無効化するため) */
  const [resizing, setResizing] = useState(false);

  // イベントリスナー内から最新状態を同期的に参照するためのミラー
  const stateRef = useRef(state);
  stateRef.current = state;

  // レイアウト変更を保存する
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ストレージが使えない環境では永続化なしで動作を続ける
    }
  }, [state, storageKey]);

  /** 境界線の mousedown から始まるドラッグリサイズ */
  const startResize = useCallback(
    (e: ReactMouseEvent) => {
      if (stateRef.current.collapsed) return;
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = stateRef.current.width;
      setResizing(true);
      // ドラッグ中はテキスト選択を止め、カーソルをリサイズ用に固定する
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

  /** 折りたたみ / 再展開のトグル */
  const toggle = useCallback(
    () => setState((s) => ({ ...s, collapsed: !s.collapsed })),
    []
  );

  /** 幅を既定値に戻す(境界線のダブルクリック用) */
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
