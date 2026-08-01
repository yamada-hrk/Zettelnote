// ============================================================
// ハッシュタグ抽出モジュール
//
// 本文中の「#タグ名」をハッシュタグとして認識する。
//   - 認識例: #Zettelkasten / #アイデア / #読書メモ
//   - Markdown 見出し(「# 見出し」= # の直後が空白)とは区別される
//   - 「##タグ」のような連続 # はタグとして扱わない
//   - コードブロック・インラインコード内の # は無視する
//   - NFKC 正規化 + 小文字化で同一視する(#ToDo と #todo は同じタグ)
// ============================================================

/**
 * タグとして許可する文字: 英数字・アンダースコア・ハイフン・
 * 漢字・ひらがな・カタカナ・長音符
 * 直前が「行頭 or 空白 or 開き括弧類」の # のみをタグ開始とみなす
 */
const TAG_PATTERN = /(?<=^|[\s(（「『>])#([0-9a-z_\-一-鿿ぁ-ゖ゠-ヿー]+)/gim;

/**
 * テキストからハッシュタグを抽出する
 * @param {string} text Markdown 本文
 * @returns {string[]} 正規化済みタグの配列(重複なし・出現順)
 */
function extractTags(text) {
  if (!text) return [];
  // コードブロック・インラインコード内はタグとして扱わない
  const src = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .normalize('NFKC');

  const tags = [];
  const seen = new Set();
  for (const m of src.matchAll(TAG_PATTERN)) {
    const tag = m[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

module.exports = { extractTags };
