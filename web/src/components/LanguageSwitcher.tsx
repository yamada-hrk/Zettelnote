// ============================================================
// アプリ本体の表示言語切り替え(フェーズ2)
//
// 切り替えは即座に画面へ反映され(ページリロード不要)、選択結果は
// i18next-browser-languagedetector 経由でlocalStorageに保存される
// (次回訪問時も維持される)。詳細は lib/i18n.ts 参照
// ============================================================
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isJa = i18n.resolvedLanguage?.startsWith('ja');

  return (
    <button
      onClick={() => void i18n.changeLanguage(isJa ? 'en' : 'ja')}
      className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
    >
      🌐 {isJa ? 'English' : '日本語'}
    </button>
  );
}
