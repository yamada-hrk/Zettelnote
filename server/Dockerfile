# ============================================================
# 同期 API サーバー + Web版アプリの配信
#
# マルチステージビルド:
#   1. web-builder … web/ アプリをビルドする。web/ は
#      electron/search.js・tags.js・embeddingCatalog.js・
#      src/hooks/useDebounce.ts・src/types.ts を直接 import して
#      共有しているため、このステージのビルドコンテキストは
#      リポジトリルートにする必要がある
#      (docker-compose.yml 側で context: . を指定している)
#   2. 最終イメージ … API サーバー本体 + ビルド済み web/dist を同梱。
#      同一オリジンで配信されるため本番では CORS も実質不要になる
# ============================================================
FROM node:22-alpine AS web-builder
WORKDIR /repo

# Web版が直接参照する共有ロジック(コピーではなく同じソース。
# react 等の依存を持たない純粋ロジックのみを共有する方針にしている)
COPY electron/search.js electron/search.js
COPY electron/tags.js electron/tags.js
COPY electron/embeddingCatalog.js electron/embeddingCatalog.js

COPY web/package*.json web/
RUN cd web && npm install

COPY web web
RUN cd web && npm run build

# ---- 最終イメージ: API サーバー ----
FROM node:22-alpine
WORKDIR /app

COPY server/package.json ./
RUN npm install --omit=dev

COPY server/index.js ./
COPY --from=web-builder /repo/web/dist /web/dist

EXPOSE 8787
CMD ["node", "index.js"]
