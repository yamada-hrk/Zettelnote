// ============================================================
// モデルカタログ(「意味的類似」の計算方式を切り替え可能にする)
//
// 各エントリは「モデル・前処理・次元数」を1セットにまとめた不変の
// 識別子として持つ。公開後にエントリの中身を書き換えることはせず、
// 計算方法に影響する変更が必要な場合は新しい id のエントリを追加する
// (詳細は 意味的類似_埋め込みモデル導入提案.md 4.1)
//
// フェーズ0の技術検証(Node.js実測)により paraphrase-multilingual-
// mpnet-base-v2 を採用モデルとして選定済み(0章参照)。フェーズ2で
// このモデルを実際にカタログへ追加する。
//
// vectorSearch() は全エントリで戻り値を Promise に統一している
// (バイグラムは同期処理で完結するが、呼び出し側を単純にするため
// async 化している)。
//
// 注意: このファイルは @huggingface/transformers を直接 require/import
// しない。Web版のWorkerビルド(Rolldown)がCJSファイル内の動的import
// を解決できない制約があるため、embed関数(テキスト→ベクトル)は
// 呼び出し側(Node/Electronならrequire、WebならESM importで用意した
// もの)を引数として受け取る形にしている(依存を注入する側が
// バンドラの都合を吸収する)
//
// キャッシュについて: mpnet のような重いモデルは、呼び出し側
// (Web版なら Worker、4.2 で同期対象になる予定)が forBodyHash 判定
// 付きのキャッシュアダプタ(get/set)を渡せる。バイグラムは 4.4.1 の
// 設計通りキャッシュ自体が不要なため、この引数を無視する
// ============================================================
const search = require('./search');

/** ユーザーが未選択の場合に使う既定のカタログエントリID */
const DEFAULT_MODEL_ID = 'bigram-tfidf-v1';

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/**
 * mpnet-base-v2 によるベクトル検索。
 * @param {(text: string) => Promise<number[]>} embed 埋め込み関数(呼び出し側が注入)
 * cache が渡された場合、docs 側(検索対象メモ)の埋め込みは
 * forBodyHash が一致する限り再利用し、クエリ側(編集中テキスト)は
 * 都度その場の内容なのでキャッシュしない
 */
async function mpnetVectorSearch(query, docs, topK, cache, embed) {
  const queryVec = await embed(query);

  const docVecs = await Promise.all(
    docs.map(async (d) => {
      const text = `${d.title}\n${d.body}`;
      if (cache) {
        const cached = await cache.get(d.id, text);
        if (cached) return cached;
      }
      const vec = await embed(text);
      if (cache) await cache.set(d.id, text, vec);
      return vec;
    }),
  );

  return docs
    .map((d, i) => ({
      id: d.id,
      title: d.title || '(無題)',
      excerpt: search.makeExcerpt(d.body),
      score: cosine(queryVec, docVecs[i]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

const catalog = [
  {
    id: 'bigram-tfidf-v1',
    label: '超軽量(バイグラム)',
    needsCache: false,
    needsEmbedder: false,
    vectorSearch: async (query, docs, topK) => search.vectorSearch(query, docs, topK),
  },
  {
    id: 'mpnet-multilingual-base-v2-int8-v1',
    label: '高精度(多言語)',
    needsCache: true,
    needsEmbedder: true,
    vectorSearch: (query, docs, topK, cache, embed) =>
      mpnetVectorSearch(query, docs, topK, cache, embed),
  },
];

/** カタログエントリをidで取得する。未知のidの場合は既定エントリにフォールバックする */
function getCatalogEntry(id) {
  return catalog.find((c) => c.id === id) || catalog.find((c) => c.id === DEFAULT_MODEL_ID);
}

module.exports = { catalog, getCatalogEntry, DEFAULT_MODEL_ID };
