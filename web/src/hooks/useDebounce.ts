// ============================================================
// デバウンスフック(src/hooks/useDebounce.ts と同一ロジック)
//
// 本来は共有したいところだが、react に依存するファイルを
// web/ の外から相対 import すると、Docker のビルドコンテキスト
// (web/node_modules しか存在しない)で react を解決できず
// ビルドが壊れる。search.js・tags.js のような依存ゼロの純粋
// ロジックはそのまま共有できるが、react 依存ファイルは
// この小さなフックに限りローカルへ複製している
// ============================================================
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
