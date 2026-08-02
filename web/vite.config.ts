// Vite 設定(Web版)
// - デスクトップ版(ルートの vite.config.ts)とほぼ同じだが base は既定(絶対パス)のまま。
//   Web版は file:// ではなく通常の HTTP で配信するため相対パス化は不要
// - electron/ 配下の search.js / tags.js を直接 import するため、
//   web ディレクトリの外(../electron, ../src)を Vite の探索対象に含める
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
