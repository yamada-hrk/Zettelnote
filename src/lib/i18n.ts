// ============================================================
// デスクトップ版の表示言語設定
//
// tmp/多言語化(英語対応)の導入提案.md フェーズ5。Web版
// (web/src/lib/i18n.ts)と同じreact-i18next基盤だが、既定言語は
// Web版(英語圏の検索流入狙い)とは異なりここでは日本語にしている。
// デスクトップ版はインストール済みソフトウェアでGoogle検索の
// インデックス対象ではなく、これまで日本語UIのみで提供してきた
// 既存ユーザーへの影響を避けるため(判定できない場合に英語へ
// 切り替わると既存ユーザー体験が変わってしまう)。
//
// 判定優先順位: localStorageの設定 > OS/ブラウザの言語設定
// (navigator.language) > 既定言語(日本語)
// ============================================================
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ja from '../locales/ja.json';
import en from '../locales/en.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    fallbackLng: 'ja',
    supportedLngs: ['ja', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'zettelnote:lang',
    },
    interpolation: {
      escapeValue: false, // Reactが既にXSS対策済みのため不要
    },
  });

export default i18n;
