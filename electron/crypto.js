// ============================================================
// クライアントサイド暗号化モジュール(ゼロ知識暗号化)
//
// ■ 方式
//   - 鍵導出: scrypt(パスフレーズ + salt) → 256bit 鍵
//     salt はサーバーに保存される(salt は秘密情報ではない。
//     複数クライアントが同じ鍵を導出するために共有が必要)
//   - 暗号化: AES-256-GCM(ノートごとにランダム 12byte IV、
//     認証タグは暗号文末尾に連結して保存 → 改ざん検知つき)
//
// ■ ゼロ知識の担保
//   パスフレーズと導出鍵はクライアント(このプロセス)にのみ存在し、
//   サーバーへは「暗号文 + IV + salt + keyCheck」しか送らない。
//   keyCheck は既知の定数を暗号化したもので、パスフレーズが正しいか
//   をクライアント側で検証するために使う(鍵の情報は漏れない)。
// ============================================================
const crypto = require('crypto');

/** keyCheck 用の既知平文(これを復号できれば鍵が正しい) */
const KEY_CHECK_PLAINTEXT = 'zettelkasten-key-check-v1';

/** 鍵導出用の salt(base64)を新規生成する */
function generateSalt() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * パスフレーズから暗号化キーを導出する
 * @param {string} passphrase ユーザー設定のパスフレーズ
 * @param {string} saltB64 base64 の salt
 * @returns {Buffer} 32byte の鍵
 */
function deriveKey(passphrase, saltB64) {
  // NFKC 正規化: 全角/半角の揺れで別鍵にならないようにする
  return crypto.scryptSync(
    passphrase.normalize('NFKC'),
    Buffer.from(saltB64, 'base64'),
    32,
    { N: 16384, r: 8, p: 1 }
  );
}

/**
 * オブジェクトを JSON 化して暗号化する
 * @returns {{ iv: string, payload: string }} base64 の IV と暗号文(+認証タグ)
 */
function encryptJson(key, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(obj), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16byte
  return {
    iv: iv.toString('base64'),
    payload: Buffer.concat([ct, tag]).toString('base64'),
  };
}

/**
 * encryptJson の逆変換
 * 鍵が違う・データが改ざんされている場合は例外を投げる
 */
function decryptJson(key, ivB64, payloadB64) {
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(payloadB64, 'base64');
  const tag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

/** パスフレーズ検証用の keyCheck 文字列(JSON)を作る */
function makeKeyCheck(key) {
  return JSON.stringify(encryptJson(key, { check: KEY_CHECK_PLAINTEXT }));
}

/** keyCheck を復号して鍵の正しさを検証する */
function verifyKeyCheck(key, keyCheckStr) {
  try {
    const { iv, payload } = JSON.parse(keyCheckStr);
    return decryptJson(key, iv, payload).check === KEY_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

module.exports = {
  generateSalt,
  deriveKey,
  encryptJson,
  decryptJson,
  makeKeyCheck,
  verifyKeyCheck,
};
