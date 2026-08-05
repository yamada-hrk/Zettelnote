// ============================================================
// モデルカタログ(「意味的類似」の計算方式を切り替え可能にする)
//
// 各エントリは「モデル・前処理・次元数」を1セットにまとめた不変の
// 識別子として持つ。公開後にエントリの中身を書き換えることはせず、
// 計算方法に影響する変更が必要な場合は新しい id のエントリを追加する
// (詳細は 意味的類似_埋め込みモデル導入提案.md 4.1)
//
// フェーズ1時点では既存のバイグラムTF-IDF(search.js)のみを登録して
// いる。挙動は従来の search.vectorSearch() 単体呼び出しと完全に同一
// (電子版・Web版どちらも、このカタログ経由の呼び出しに置き換えるのみ)。
// 将来の埋め込みモデル(paraphrase-multilingual-mpnet-base-v2 等)は、
// このカタログへエントリを追加するだけで導入できる構造にしてある
// ============================================================
const search = require('./search');

/** ユーザーが未選択の場合に使う既定のカタログエントリID */
const DEFAULT_MODEL_ID = 'bigram-tfidf-v1';

const catalog = [
  {
    id: 'bigram-tfidf-v1',
    label: '超軽量(バイグラム)',
    /** @type {(query: string, docs: {id: any, title: string, body: string}[], topK: number) => any[]} */
    vectorSearch: (query, docs, topK) => search.vectorSearch(query, docs, topK),
  },
];

/** カタログエントリをidで取得する。未知のidの場合は既定エントリにフォールバックする */
function getCatalogEntry(id) {
  return catalog.find((c) => c.id === id) || catalog.find((c) => c.id === DEFAULT_MODEL_ID);
}

module.exports = { catalog, getCatalogEntry, DEFAULT_MODEL_ID };
