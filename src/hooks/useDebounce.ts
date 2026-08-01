// ============================================================
// デバウンスフック
// - 値の変化が「落ち着いてから」指定ミリ秒後に反映される
// - タイピング中の無駄な検索・保存を防ぐために使用する
// ============================================================
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // 値が再度変化したらタイマーをリセットする
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
