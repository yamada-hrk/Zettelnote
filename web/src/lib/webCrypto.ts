// ============================================================
// クライアントサイド暗号化モジュール(Web版・ゼロ知識暗号化)
//
// electron/crypto.js と**完全にバイト互換**になるよう設計している
// (同じアカウントのメモをデスクトップ版・Web版どちらからでも
// 復号できる必要があるため、鍵導出パラメータ・暗号方式・
// ワイヤーフォーマットを1バイトも違えてはいけない)。
//
// ■ 対応関係(electron/crypto.js ⇔ ここ)
//   - 鍵導出: Node crypto.scryptSync ⇔ scrypt-js(純JS実装、ブラウザに
//     scrypt が無いための代替。N/r/p/dkLen は完全に同じ値を使う)
//   - 暗号化: Node crypto(aes-256-gcm, タグを手動連結)
//     ⇔ Web Crypto SubtleCrypto(AES-GCM は仕様上タグを暗号文末尾に
//     自動連結するため、追加コードなしで同じワイヤーフォーマットになる)
//   - この互換性は web/scripts/verify-crypto-compat.mjs で検証している
// ============================================================
import { scrypt } from 'scrypt-js';

/** keyCheck 用の既知平文(electron/crypto.js と同一の値でなければならない) */
const KEY_CHECK_PLAINTEXT = 'zettelkasten-key-check-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 鍵導出用の salt(base64)を新規生成する */
export function generateSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * パスフレーズから暗号化キーを導出する(SubtleCrypto の CryptoKey として返す)
 * scrypt のパラメータ(N=16384, r=8, p=1, dkLen=32)は electron/crypto.js と同一
 */
export async function deriveKey(
  passphrase: string,
  saltB64: string
): Promise<CryptoKey> {
  // NFKC 正規化: 全角/半角の揺れで別鍵にならないようにする(Node版と同一の前処理)
  const passBytes = enc.encode(passphrase.normalize('NFKC'));
  const saltBytes = base64ToBytes(saltB64);
  const rawKey = await scrypt(passBytes, saltBytes, 16384, 8, 1, 32);
  // scrypt-js の型定義が ArrayBufferLike 全般を許容する型のため、
  // SubtleCrypto が要求する具体的な ArrayBuffer 裏付き型へ明示キャストする
  // (実行時は常に通常の ArrayBuffer で確保されるため安全)
  return crypto.subtle.importKey(
    'raw',
    rawKey as Uint8Array<ArrayBuffer>,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * オブジェクトを JSON 化して暗号化する
 * @returns base64 の IV と暗号文(+認証タグ。SubtleCrypto が自動連結する)
 */
export async function encryptJson(
  key: CryptoKey,
  obj: unknown
): Promise<{ iv: string; payload: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(obj))
  );
  return {
    iv: bytesToBase64(iv),
    payload: bytesToBase64(new Uint8Array(ctBuffer)),
  };
}

/**
 * encryptJson の逆変換
 * 鍵が違う・データが改ざんされている場合は例外を投げる
 * (SubtleCrypto がタグ検証を内部で行うため、手動でのタグ分離は不要)
 */
export async function decryptJson(
  key: CryptoKey,
  ivB64: string,
  payloadB64: string
): Promise<any> {
  const iv = base64ToBytes(ivB64) as Uint8Array<ArrayBuffer>;
  const data = base64ToBytes(payloadB64) as Uint8Array<ArrayBuffer>;
  const ptBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(dec.decode(ptBuffer));
}

/** パスフレーズ検証用の keyCheck 文字列(JSON)を作る */
export async function makeKeyCheck(key: CryptoKey): Promise<string> {
  return JSON.stringify(await encryptJson(key, { check: KEY_CHECK_PLAINTEXT }));
}

/** keyCheck を復号して鍵の正しさを検証する */
export async function verifyKeyCheck(
  key: CryptoKey,
  keyCheckStr: string
): Promise<boolean> {
  try {
    const { iv, payload } = JSON.parse(keyCheckStr);
    const result = await decryptJson(key, iv, payload);
    return result.check === KEY_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}
