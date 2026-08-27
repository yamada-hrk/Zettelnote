#!/usr/bin/env bash
# ============================================================
# 本番デプロイ(ダウンタイム無し)
#
# api・api2 の2台構成(docker-compose.yml参照)を1台ずつ順番に
# 再起動することで、常にどちらか一方が生きた状態を保ちながら
# デプロイする。db・landingは冗長構成の対象外なので通常通り再作成する
# (db は普段ほぼ再起動不要、landing の一瞬の停止は許容している)。
#
# 使い方: scripts/deploy-prod.sh
# 前提: リポジトリルートで実行し、mainブランチのコードであること
#       (本番は必ずmainからデプロイする運用。詳細はCLAUDE.md参照)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -p zettelnote -f docker-compose.yml"
TIMEOUT_SEC=60

wait_healthy() {
  local container="$1"
  local waited=0
  echo "  ${container} のヘルスチェック待ち…"
  while true; do
    status="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")"
    if [ "$status" = "healthy" ]; then
      echo "  ${container}: healthy"
      return 0
    fi
    if [ "$waited" -ge "$TIMEOUT_SEC" ]; then
      echo "  ${container}: ${TIMEOUT_SEC}秒待っても healthy になりませんでした(status=${status})" >&2
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

echo "==> イメージをビルド"
$COMPOSE build

echo "==> db・landing・logsidecar を通常通り更新"
$COMPOSE up -d db landing logsidecar

echo "==> api を再作成"
$COMPOSE up -d --no-deps api
wait_healthy zettelnote-api-1

echo "==> api2 を再作成(この間 api が生きているのでダウンタイム無し)"
$COMPOSE up -d --no-deps api2
wait_healthy zettelnote-api2-1

echo "==> 完了"
