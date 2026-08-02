// ============================================================
// 数値がしきい値を超えたか(ヒステリシス付き)を判定するフック
// (src/hooks/useThresholdMode.ts と同一ロジック。react 依存のため
// useDebounce.ts と同じ理由でローカルに複製している)
// ============================================================
import { useEffect, useState } from 'react';

export function useThresholdMode(
  value: number,
  enter: number,
  exit: number
): boolean {
  const [active, setActive] = useState(value >= enter);

  useEffect(() => {
    setActive((prev) => {
      if (!prev && value >= enter) return true;
      if (prev && value <= exit) return false;
      return prev;
    });
  }, [value, enter, exit]);

  return active;
}
