// Vite 設定(Web版)
// - デスクトップ版(ルートの vite.config.ts)とほぼ同じだが base は既定(絶対パス)のまま。
//   Web版は file:// ではなく通常の HTTP で配信するため相対パス化は不要
// - electron/ 配下の search.js / tags.js を直接 import するため、
//   web ディレクトリの外(../electron, ../src)を Vite の探索対象に含める
// - PWA化(vite-plugin-pwa): 手書きの Service Worker はキャッシュの
//   無効化まわりで事故りやすいため、Workbox ベースの実績あるプラグインに
//   ビルド成果物のプリキャッシュ・SWの世代管理を任せている。
//   API(/api/*)はキャッシュ対象に含めない(既存の IndexedDB キャッシュが
//   データ面の高速化を担っており、SW はアプリ本体の即時起動が役割)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ZettelNote',
        short_name: 'ZettelNote',
        description:
          'メモ同士のつながりをリアルタイムに提示するツェッテルカステン・メモアプリ',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0d14',
        theme_color: '#0b0d14',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // ビルド成果物(JS/CSS/HTML/アイコン)のみプリキャッシュする。
        // /api/* はここに含まれないため、ネットワーク越しの通常の
        // fetch のまま(SW がデータをキャッシュ・横取りすることはない)
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // SPA のナビゲーションリクエストはオフライン時でも index.html を返す
        // (このアプリはクライアントサイドルーティングを持たず常に単一URLだが、
        // 標準的な作法として明示しておく)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      // 開発時は API サーバー(docker compose, :8787)へプロキシする
      '/api': 'http://localhost:8787',
    },
    fs: {
      // ../electron, ../src の共有ロジックを Vite が配信できるようにする
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
  },
});
