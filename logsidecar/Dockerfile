# ============================================================
# ログ収集サイドカー
#
# docker.sock経由で指定コンテナ(TARGET_CONTAINERS環境変数)の標準出力
# ログを継続的に読み取り、/logs/<コンテナ名>/access.log へ永続化する。
# 対象コンテナ自身にはファイル書き込み・ローテーションのロジックを
# 持たせず、標準出力に吐くだけで良い設計にしている(api/api2のような
# 冗長構成でも、各コンテナが個別にファイル・ローテーションを管理する
# 必要が無い)
# ============================================================
FROM docker:27-cli
RUN apk add --no-cache logrotate
WORKDIR /app
COPY collect.sh entrypoint.sh logrotate.conf ./
RUN chmod +x collect.sh entrypoint.sh && chmod 644 logrotate.conf
ENTRYPOINT ["./entrypoint.sh"]
