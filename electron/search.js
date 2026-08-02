// ============================================================
// 検索モジュール(完全ローカル・外部通信なし)
//
// ■ ベクトル検索(意味的類似)
//   文字バイグラム TF-IDF ベクトル + コサイン類似度で実装。
//   日本語は分かち書き不要で扱えるため、軽量かつ言語非依存に動作する。
//   ※ ステップ2以降で、ローカル埋め込みモデル(例: multilingual-e5-small 等)に
//     差し替える場合も、vectorSearch() の中身を置き換えるだけで済む構造。
//
// ■ キーワード検索(ハッシュタグ最優先 + 単語一致)
//   編集中テキストから特徴語(英単語・カタカナ語・漢字語)を抽出し、
//   他メモへの出現頻度と位置(タイトル/本文)で採点する。
//   さらにハッシュタグ(#タグ名)の一致を最優先とする合成スコアで並べる:
//     第1優先 … 同じハッシュタグを持つメモ(一致タグ数が多いほど上位)
//     第2優先 … 一般キーワードのみ一致するメモ
// ============================================================
const { extractTags } = require('./tags');

// ------------------------------------------------------------
// 共通ユーティリティ
// ------------------------------------------------------------

/** テキストの正規化(全半角統一・小文字化・空白圧縮) */
function normalize(text) {
  return (text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown 記法をざっくり除去する(検索ノイズ低減・抜粋表示用) */
function stripMarkdown(text) {
  return (text || '')
    .replace(/```[\s\S]*?```/g, ' ')   // コードブロック
    .replace(/`[^`]*`/g, ' ')          // インラインコード
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // リンク → リンク文字列のみ
    .replace(/^#{1,6}\s+/gm, '')       // 見出し記号
    .replace(/[*_~>#|-]+/g, ' ')       // その他の記号
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------
// ベクトル検索(文字バイグラム TF-IDF + コサイン類似度)
// ------------------------------------------------------------

/** 文字バイグラム(2文字組)の出現回数マップを作る */
function bigramCounts(text) {
  const s = normalize(stripMarkdown(text)).replace(/ /g, '');
  const counts = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

/**
 * ベクトル検索本体
 * @param {string} queryText 編集中のテキスト(タイトル+本文)
 * @param {{id:number,title:string,body:string}[]} docs 検索対象メモ
 * @param {number} topK 上位何件返すか
 * @returns {{id:number,title:string,excerpt:string,score:number}[]}
 */
function vectorSearch(queryText, docs, topK) {
  if (docs.length === 0) return [];

  // 1. 各文書 + クエリのバイグラム頻度を取得
  const docGrams = docs.map((d) => bigramCounts(`${d.title} ${d.body}`));
  const queryGrams = bigramCounts(queryText);
  if (queryGrams.size === 0) return [];

  // 2. DF(文書頻度)を数えて IDF を計算(クエリも母集団に含める)
  const df = new Map();
  const all = [...docGrams, queryGrams];
  for (const grams of all) {
    for (const gram of grams.keys()) {
      df.set(gram, (df.get(gram) || 0) + 1);
    }
  }
  const N = all.length;
  const idf = (gram) => Math.log(1 + N / (df.get(gram) || 1));

  // 3. TF-IDF ベクトル(疎ベクトル)とノルムを作る
  const toVec = (grams) => {
    const vec = new Map();
    let norm = 0;
    for (const [gram, tf] of grams) {
      const w = (1 + Math.log(tf)) * idf(gram);
      vec.set(gram, w);
      norm += w * w;
    }
    return { vec, norm: Math.sqrt(norm) };
  };
  const qv = toVec(queryGrams);

  // 4. コサイン類似度で採点
  const scored = docs.map((d, i) => {
    const dv = toVec(docGrams[i]);
    let dot = 0;
    // 小さい方のベクトルを走査して内積を取る
    const [small, large] =
      qv.vec.size < dv.vec.size ? [qv.vec, dv.vec] : [dv.vec, qv.vec];
    for (const [gram, w] of small) {
      const w2 = large.get(gram);
      if (w2) dot += w * w2;
    }
    const denom = qv.norm * dv.norm;
    const score = denom > 0 ? dot / denom : 0;
    return {
      id: d.id,
      title: d.title || '(無題)',
      excerpt: makeExcerpt(d.body),
      score,
    };
  });

  return scored
    .filter((s) => s.score > 0.01) // ほぼ無関係なものは出さない
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ------------------------------------------------------------
// キーワード検索(特徴語の一致)
// ------------------------------------------------------------

/**
 * テキストから特徴語を抽出する
 * - 英数字語(2文字以上) / カタカナ語(2文字以上) / 漢字語(1文字以上)
 * - ひらがな連続は助詞・助動詞が多いため対象外
 * @returns {{term:string, weight:number}[]} 重要度順の特徴語リスト
 */
function extractTerms(text, maxTerms = 15) {
  const s = normalize(stripMarkdown(text));
  const pattern = /[a-z0-9_]{2,}|[゠-ヿー]{2,}|[一-鿿]{1,}/g;
  const freq = new Map();
  for (const m of s.matchAll(pattern)) {
    const term = m[0];
    freq.set(term, (freq.get(term) || 0) + 1);
  }
  // 重要度 = 出現回数 × 語長(長い語ほど特徴的とみなす)
  return [...freq.entries()]
    .map(([term, count]) => ({ term, weight: count * Math.min(term.length, 6) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxTerms);
}

/**
 * キーワード検索本体(ハッシュタグ一致を最優先してソートする)
 *
 * ハッシュタグのパース結果と特徴語抽出を組み合わせた合成スコアで採点する:
 *   合成スコア = 一致タグ数 × (キーワード最高点 + 1) + キーワード点
 * 「タグ1件の一致 > どんなキーワード一致よりも強い」と定義することで、
 * タグ一致メモが必ずキーワードのみのメモより上位に並ぶ。
 * タグさえ一致していればキーワードが一つも一致しないメモも候補に含める。
 *
 * @returns {{id:number,title:string,excerpt:string,score:number,matchedTerms:string[],sharedTags:string[]}[]}
 */
function keywordSearch(queryText, docs, topK) {
  const terms = extractTerms(queryText);
  const queryTags = extractTags(queryText);
  if (terms.length === 0 && queryTags.length === 0) return [];

  const scored = docs.map((d) => {
    const title = normalize(d.title);
    const body = normalize(stripMarkdown(d.body));
    let raw = 0;
    const matchedTerms = [];
    let firstMatchTerm = null;

    for (const { term, weight } of terms) {
      // タイトル一致は本文一致より高く評価する
      const inTitle = countOccurrences(title, term);
      const inBody = countOccurrences(body, term);
      if (inTitle + inBody > 0) {
        raw += weight * (inTitle * 3 + Math.min(inBody, 5));
        matchedTerms.push(term);
        if (!firstMatchTerm && inBody > 0) firstMatchTerm = term;
      }
    }

    // 編集中テキストと共通のハッシュタグ(第1優先の判定材料)
    const docTags = extractTags(`${d.title}\n${d.body}`);
    const sharedTags = queryTags.filter((t) => docTags.includes(t));

    return {
      id: d.id,
      title: d.title || '(無題)',
      excerpt: makeExcerpt(d.body, firstMatchTerm),
      raw,
      matchedTerms: matchedTerms.slice(0, 5),
      sharedTags,
    };
  });

  // タグ1件の重み = キーワード満点 + 1(タグ一致を常に上へ)
  const maxRaw = Math.max(...scored.map((s) => s.raw), 1);
  const tagWeight = maxRaw + 1;

  const ranked = scored
    .map((s) => ({ ...s, combined: s.sharedTags.length * tagWeight + s.raw }))
    .filter((s) => s.combined > 0)
    .sort((a, b) => b.combined - a.combined)
    .slice(0, topK);

  // 合成スコアを 0〜1 に正規化(スコアバー表示も順位と整合する)
  const maxCombined = Math.max(...ranked.map((s) => s.combined), 1);
  return ranked.map(({ raw, combined, ...s }) => ({
    ...s,
    score: combined / maxCombined,
  }));
}

/**
 * キーワード検索(左ペインの絞り込み用・部分一致フィルタ)
 * 空白区切りの複数語は「すべて含む」メモのみ返す(AND 条件)。
 * normalize によりひらがな/カタカナ以外の全半角・大文字小文字の揺れを吸収する。
 * @param {string} query 検索クエリ
 * @param {{id:number,title:string,body:string}[]} docs 検索対象メモ
 * @returns docs の順序(更新日時降順)を保った部分配列
 */
function keywordFilter(query, docs) {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];
  return docs.filter((d) => {
    const text = normalize(`${d.title}\n${d.body}`);
    return terms.every((t) => text.includes(t));
  });
}

/** 部分文字列の出現回数を数える */
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    count++;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}

/**
 * 抜粋テキストを作る
 * @param {string} body 本文
 * @param {string|null} aroundTerm 指定語の周辺を切り出す(なければ先頭)
 */
function makeExcerpt(body, aroundTerm = null, length = 90) {
  const plain = stripMarkdown(body);
  if (!plain) return '';
  if (aroundTerm) {
    const idx = normalize(plain).indexOf(aroundTerm);
    if (idx > 20) {
      const start = Math.max(0, idx - 20);
      return `…${plain.slice(start, start + length)}${plain.length > start + length ? '…' : ''}`;
    }
  }
  return plain.slice(0, length) + (plain.length > length ? '…' : '');
}

module.exports = { vectorSearch, keywordSearch, keywordFilter };
