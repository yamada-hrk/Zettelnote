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
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));

// electron/search.js・electron/tags.js は Electron(Node/CJS)側で require()
// される都合上 CommonJS のまま(module.exports/require)になっている。
// vite build(本番)は Rollup が CJS→ESM 変換を行うため問題ないが、
// dev サーバーは相対 import を素の ESM としてブラウザへそのまま返すため
// require が未定義の ReferenceError になる。この2ファイルに限り、
// dev サーバー配信時だけ CJS 構文を ESM に書き換える(ファイル自体は
// 変更しない。Electron 側の require() には一切影響しない)。
function sharedCjsToEsmForDev(): Plugin {
  // Vite の module id は POSIX 区切り(/)に正規化されるが、path.resolve() は
  // Windows では \ 区切りを返すため、比較前に両方を / 区切りへ揃える
  const toPosix = (p: string) => p.replace(/\\/g, '/');
  const targets = new Set([
    toPosix(resolve(__dirname, '../electron/search.js')),
    toPosix(resolve(__dirname, '../electron/tags.js')),
  ]);
  return {
    name: 'shared-cjs-to-esm-dev',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      const file = toPosix(id.split('?')[0]);
      if (!targets.has(file)) return;
      const esm = code
        .replace(
          /const\s*\{\s*extractTags\s*\}\s*=\s*require\(['"]\.\/tags['"]\);?/,
          "import { extractTags } from './tags.js';",
        )
        .replace(/module\.exports\s*=\s*(\{[^}]*\});?/, 'export $1;');
      return { code: esm, map: null };
    },
  };
}

export default defineConfig({
  plugins: [
    sharedCjsToEsmForDev(),
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
