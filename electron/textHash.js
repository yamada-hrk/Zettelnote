// ============================================================
// テキストのハッシュ化(forBodyHash用)
//
// 暗号学的な安全性は不要(用途は「本文が変わったかどうか」の検知のみ)
// なため、環境(Node/ブラウザ/Worker)を問わず追加APIなしで動く
// FNV-1a を使う。意味的類似_埋め込みモデル導入提案.md 4.1 の
// forBodyHash はこれで生成する
// ============================================================
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

module.exports = { hashText };
