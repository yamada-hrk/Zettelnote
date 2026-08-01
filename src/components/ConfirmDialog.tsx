// ============================================================
// アプリ内確認モーダル(ConfirmProvider + useConfirm)
//
// window.confirm(Electron のフォーカス破壊バグあり)や
// ネイティブダイアログの代わりに、アプリの世界観(ダーク +
// すりガラス)に合わせた確認モーダルを Promise ベースで提供する。
//
// 使い方:
//   const confirm = useConfirm();
//   const ok = await confirm({
//     title: 'メモの削除',
//     message: 'このメモを削除しますか?',
//     confirmLabel: '削除する',
//     danger: true,
//   });
//
// キーボード: Enter = OK / Escape = キャンセル
// ============================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';

interface ConfirmOptions {
  /** モーダル上部の見出し(省略可) */
  title?: string;
  message: string;
  /** OK ボタンのラベル(既定: OK) */
  confirmLabel?: string;
  /** キャンセルボタンのラベル(既定: キャンセル) */
  cancelLabel?: string;
  /** true なら OK ボタンを危険色(赤)にする(削除など) */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** 確認モーダルを開く関数を返すフック(ConfirmProvider 配下で使用) */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm は ConfirmProvider の配下で使用してください');
  return fn;
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ActiveConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => setCurrent({ ...options, resolve })),
    []
  );

  const close = useCallback(
    (result: boolean) => {
      setCurrent((cur) => {
        cur?.resolve(result);
        return null;
      });
    },
    []
  );

  // キーボード操作(capture で他のショートカットより優先する)
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [current, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {current && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false); // 背景クリックでキャンセル
          }}
        >
          <div className="w-96 rounded-2xl border border-white/10 bg-[#12151f]/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-xl">
            {current.title && (
              <h3 className="text-sm font-bold text-slate-200">{current.title}</h3>
            )}
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              {current.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-xl px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                {current.cancelLabel ?? 'キャンセル'}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={`rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 transition-all duration-200 active:scale-[0.98] ${
                  current.danger
                    ? 'bg-gradient-to-b from-red-500 to-red-600 shadow-red-950/50 hover:from-red-400 hover:to-red-500'
                    : 'bg-gradient-to-b from-indigo-500 to-indigo-600 shadow-indigo-950/50 hover:from-indigo-400 hover:to-indigo-500'
                }`}
              >
                {current.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
