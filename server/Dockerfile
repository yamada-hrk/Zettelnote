# 同期 API サーバー(Node.js / Express)
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

EXPOSE 8787
CMD ["node", "index.js"]
