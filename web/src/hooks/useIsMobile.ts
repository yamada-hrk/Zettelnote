// ============================================================
// スマホ幅判定フック(Web版専用)
//
// window.matchMedia でビューポート幅を監視し、768px(Tailwind の
// md ブレークポイントと同じ基準)未満ならモバイルとみなす。
// デスクトップ版には存在しない概念のため共有せず Web 版のみで定義。
// ============================================================
import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
