// ============================================================
// アプリ本体(Web版)の表示言語設定
//
// tmp/多言語化(英語対応)の導入提案.md フェーズ2。ランディングページ
// (landing/)とは異なりURLを分けず、この端末のlocalStorageだけで
// 言語を管理する(詳細は提案書参照)。
//
// 判定優先順位: localStorageの設定 > ブラウザの言語設定
// (navigator.language) > 既定言語(英語)。ブラウザ言語が判定できない
// 訪問者(検索エンジンのクローラー含む)には英語を見せる方が、今回の
// 多言語化の狙い(英語圏の検索流入)に合っているための判断。
//
// 翻訳文言は web/src/locales/{ja,en}.json。フェーズ2時点ではまだ
// 一部の文言のみ翻訳キー化しており、大半はフェーズ3で対応する
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
    fallbackLng: 'en',
    supportedLngs: ['ja', 'en'],
    detection: {
      // localStorage → ブラウザ言語 → (どちらも無ければ)fallbackLng
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'zettelnote:lang',
    },
    interpolation: {
      escapeValue: false, // Reactが既にXSS対策済みのため不要
    },
  });

export default i18n;
