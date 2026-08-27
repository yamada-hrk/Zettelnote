#!/bin/sh
# ============================================================
# TARGET_CONTAINERS(スペース区切りのコンテナ名)それぞれについて、
# docker logs -f で標準出力ログを継続的に読み取り、
# /logs/<コンテナ名>/access.log へ追記する。
#
# コンテナが再作成される(ローリングデプロイ等)と docker logs -f の
# 接続は切れるが、2秒後に自動的に再接続する。再接続時は前回読んだ
# 最後の行のタイムスタンプ(.sinceファイルに保存)から再開するため、
# 大量の重複や欠落を避けられる(境界付近で数行重複する程度は許容)
# ============================================================
set -u

tail_container() {
  name="$1"
  dir="/logs/$name"
  mkdir -p "$dir"
  outfile="$dir/access.log"
  statefile="$dir/.since"

  while true; do
    since=$(cat "$statefile" 2>/dev/null || echo "")
    if [ -n "$since" ]; then
      # 前回読んだ最後の行のタイムスタンプ以降から再開する
      docker logs -f --since "$since" --timestamps "$name" 2>&1
    else
      # 初回はコンテナ起動時からの蓄積ログも含めて全部読む
      # (--since "0s" は「今から0秒前」= ほぼ現在時刻を意味してしまい、
      # 既存の蓄積ログを取りこぼすため、初回は--sinceを渡さないこと)
      docker logs -f --timestamps "$name" 2>&1
    fi | \
      while IFS= read -r line; do
        printf '%s\n' "$line" >> "$outfile"
        ts=$(printf '%s' "$line" | cut -d' ' -f1)
        [ -n "$ts" ] && printf '%s' "$ts" > "$statefile"
      done
    echo "[collect.sh] $(date -u +%FT%TZ) ${name}: docker logsが切断、2秒後に再接続します" >&2
    sleep 2
  done
}

for name in $TARGET_CONTAINERS; do
  tail_container "$name" &
done

wait
