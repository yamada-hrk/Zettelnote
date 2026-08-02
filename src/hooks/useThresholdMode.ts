// ============================================================
// 数値がしきい値を超えたか(ヒステリシス付き)を判定するフック
// 例: サイドバー幅がしきい値を超えたら表示モードを切り替える、など
//
// enter/exit に差を持たせることで、境界付近で値が微小に揺れても
// モードが高速に切り替わる「チャタリング」を防ぐ
// (例: enter=380, exit=340 なら、380px 以上でモード ON、
//  340px 以下に戻るまでは ON を維持する)
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
