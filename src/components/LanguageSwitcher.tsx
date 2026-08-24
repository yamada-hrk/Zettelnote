// ============================================================
// 表示言語切り替え(フェーズ5)
//
// Web版(web/src/components/LanguageSwitcher.tsx)と同じ考え方: 切り替えは
// 即座に画面へ反映され(再起動不要)、選択結果はlocalStorage経由で
// 次回起動時も維持される。詳細は lib/i18n.ts 参照
// ============================================================
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isJa = i18n.resolvedLanguage?.startsWith('ja');

  return (
    <button
      onClick={() => void i18n.changeLanguage(isJa ? 'en' : 'ja')}
      title={isJa ? 'English' : '日本語'}
      className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
    >
      🌐
    </button>
  );
}
