// ============================================================
// レンダラーのエントリポイント(Web版)
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './lib/i18n';
import './index.css';

// Service Worker を登録する(registerType: 'autoUpdate' のため、
// 新しいビルドがあれば裏側で自動更新し、次回アクセス時に反映される)
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
