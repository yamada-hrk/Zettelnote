# ============================================================
# Zettelnote 製品紹介ページ(AdSense審査用の仮ページ)
#
# 静的HTML/CSSのみなのでnginxでそのまま配信する。
# k8s Ingress側でstaging.zettelnote.hol-tec.net/about のパスから
# prefixを取り除いて(stripPrefixミドルウェア)このコンテナへ転送する
# 前提のため、コンテナ内は常にルート("/")基準で配信する
# ============================================================
FROM nginx:alpine
COPY landing/public /usr/share/nginx/html
