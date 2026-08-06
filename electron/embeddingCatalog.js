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

// mpnetのコサイン類似度は「無関係でも0」にはならず、しかもノイズの
// 振れ幅が読めない(実測で意味のない文字列が実在する無関係メモより
// 高スコアになる例すら確認した)。固定の絶対閾値(例: score > 0.15)を
// 検証したところ、このノイズをほぼ素通ししてしまい機能しなかった上、
// メモ数が増えるほど「たまたま高スコアになったノイズ」に遭遇する確率
// も上がるため、原理的にスケールしない。
//
// 代わりに、そのクエリにおける**候補全体のスコア分布に対する相対的な
// 位置づけ(z-score)**で判定する。実測(候補7件・14件の両方)では、
// 本当に関連するメモのz-scoreが2.0〜2.4程度で他を大きく引き離す一方、
// ノイズ・無関係な実データはすべて-1.5〜0.7程度に収まっており、
// 固定閾値よりはっきりした分離が得られた。候補数が増えてもこの傾向は
// 崩れなかった(絶対閾値ではノイズの最大値も候補数と共に伸びるが、
// z-scoreは母集団を都度参照するためこの影響を受けにくい)
const MPNET_Z_SCORE_THRESHOLD = 1.0;
/** z-score判定に必要な最小候補数。これを下回る場合は統計的に無意味なため足切りしない */
const MPNET_MIN_CANDIDATES_FOR_Z_SCORE = 5;

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

  const scored = docs.map((d, i) => ({
    id: d.id,
    title: d.title || '(無題)',
    excerpt: search.makeExcerpt(d.body),
    score: cosine(queryVec, docVecs[i]),
  }));

  // 候補が少なすぎる場合、平均・標準偏差は母集団を代表しないので
  // 足切りせずそのまま返す(ユーザー自身が目視で判断する前提)
  if (scored.length < MPNET_MIN_CANDIDATES_FOR_Z_SCORE) {
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  const mean = scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
  const variance =
    scored.reduce((sum, s) => sum + (s.score - mean) ** 2, 0) / scored.length;
  const std = Math.sqrt(variance);

  // 標準偏差が0(全候補が同スコア)の場合、z-scoreは定義できないため
  // 足切りしない
  const passesThreshold = (s) =>
    std === 0 ? true : (s.score - mean) / std > MPNET_Z_SCORE_THRESHOLD;

  return scored
    .filter(passesThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * モデル切り替え時の一括再計算(4.4)。docs全件の埋め込みを事前に
 * 計算してキャッシュへ書き込む(検索は行わない)。cache.set() が
 * 呼ばれるたびにWorker側からvectorComputed通知が飛ぶため、
 * サーバーへの同期(vectorSync.ts)は既存の仕組みがそのまま使える。
 * @param {(done: number, total: number) => void} onProgress
 */
async function mpnetWarmCache(docs, cache, embed, onProgress) {
  let done = 0;
  onProgress(0, docs.length);

  // 候補メモが全件キャッシュヒットだと、このあとの for ループが一度も
  // embed() を呼ばずに終わってしまう。すると推論エンジン(ONNX/WASM)の
  // 初回ロードが行われないまま起動時チェックが完了し、ユーザーが最初に
  // 関連メモを開いたタイミングで初めてロードが走って20秒以上「計算中…」の
  // まま待たされることになる(実測で確認済み)。起動時チェックは既に
  // 「類似度モデルを更新中」の進捗表示でカバーされているため、ここで
  // ダミーの埋め込みを1回実行して先に初期化コストを払っておく
  await embed(' ');

  for (const d of docs) {
    const text = `${d.title}\n${d.body}`;
    const cached = await cache.get(d.id, text);
    if (!cached) {
      const vec = await embed(text);
      await cache.set(d.id, text, vec);
    }
    done++;
    onProgress(done, docs.length);
  }
}

const catalog = [
  {
    id: 'bigram-tfidf-v1',
    label: '超軽量(バイグラム)',
    description: 'ダウンロード・計算コストほぼゼロ。文字の並びが似ているメモ同士を検出する',
    needsCache: false,
    needsEmbedder: false,
    vectorSearch: async (query, docs, topK) => search.vectorSearch(query, docs, topK),
    // バイグラムはキャッシュ自体を持たないため、一括再計算は不要(即座に完了扱い)
    warmCache: async (docs, cache, embed, onProgress) => onProgress(docs.length, docs.length),
  },
  {
    id: 'mpnet-multilingual-base-v2-int8-v1',
    label: '高精度(多言語)',
    description: '初回は約280MBのモデルをダウンロード。語彙が違っても意味が近いメモを検出できる',
    needsCache: true,
    needsEmbedder: true,
    // Web版がモデル本体のブラウザキャッシュ(Cache Storage)を掃除する際、
    // このリポジトリパスを含むURLのエントリを対象にする(4.6)
    modelRepo: 'Xenova/paraphrase-multilingual-mpnet-base-v2',
    vectorSearch: (query, docs, topK, cache, embed) =>
      mpnetVectorSearch(query, docs, topK, cache, embed),
    warmCache: (docs, cache, embed, onProgress) => mpnetWarmCache(docs, cache, embed, onProgress),
  },
];

/** カタログエントリをidで取得する。未知のidの場合は既定エントリにフォールバックする */
function getCatalogEntry(id) {
  return catalog.find((c) => c.id === id) || catalog.find((c) => c.id === DEFAULT_MODEL_ID);
}

module.exports = { catalog, getCatalogEntry, DEFAULT_MODEL_ID };
