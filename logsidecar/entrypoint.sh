#!/bin/sh
# ログ収集(collect.sh)をバックグラウンドで起動しつつ、
# logrotateを1時間おきに実行する(logrotate自体は/logs/.logrotate.status
# に前回実行日を記録して daily 設定を守るため、頻繁に呼んでも無害)
set -u

./collect.sh &

while true; do
  logrotate -s /logs/.logrotate.status /app/logrotate.conf
  sleep 3600
done
