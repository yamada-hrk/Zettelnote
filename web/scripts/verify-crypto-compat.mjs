// ============================================================
// electron/crypto.js(Node crypto)と web/src/lib/webCrypto.ts の
// 暗号ロジックがバイト互換であることを検証するスクリプト。
//
// 実際のブラウザは使わず、Node 18+ に組み込まれている
// `crypto.webcrypto`(Web Crypto API 準拠の実装)を「ブラウザ側」の
// 代役として使うことで、Node 単体でこの互換性を確認できる。
//
// 実行: node web/scripts/verify-crypto-compat.mjs
// ============================================================
import nodeCrypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const desktopCrypto = require('../../electron/crypto.js');
const { scrypt } = require('scrypt-js');

const webcrypto = nodeCrypto.webcrypto;
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}
function base64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** web/src/lib/webCrypto.ts と同一ロジック(Node の webcrypto で代用) */
async function webDeriveKey(passphrase, saltB64) {
  const passBytes = enc.encode(passphrase.normalize('NFKC'));
  const saltBytes = base64ToBytes(saltB64);
  const rawKey = await scrypt(passBytes, saltBytes, 16384, 8, 1, 32);
  return { raw: rawKey, cryptoKey: await webcrypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}
async function webEncryptJson(cryptoKey, obj) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(JSON.stringify(obj)));
  return { iv: bytesToBase64(iv), payload: bytesToBase64(new Uint8Array(ct)) };
}
async function webDecryptJson(cryptoKey, ivB64, payloadB64) {
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(payloadB64);
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
  return JSON.parse(dec.decode(pt));
}

const checks = [];
const ok = (label, cond) => checks.push([label, !!cond]);

async function main() {
  const passphrase = 'ひみつのパスフレーズ123';
  const salt = desktopCrypto.generateSalt();

  // 1. 鍵導出のバイト一致(scrypt-js が Node の scryptSync と同じ鍵を出すか)
  const nodeKey = desktopCrypto.deriveKey(passphrase, salt); // Buffer(32byte)
  const { raw: webRawKey, cryptoKey: webKey } = await webDeriveKey(passphrase, salt);
  ok('scrypt鍵導出がバイト一致する(Node ⇔ scrypt-js)', Buffer.from(webRawKey).equals(nodeKey));

  const note = { title: 'テスト', body: '#タグ を含む本文\n日本語 🎉', created_at: '2026-08-02 00:00:00' };

  // 2. Node(desktop)で暗号化 → Web(webcrypto)で復号
  const encByNode = desktopCrypto.encryptJson(nodeKey, note);
  const decByWeb = await webDecryptJson(webKey, encByNode.iv, encByNode.payload);
  ok('Node暗号化 → Web復号 が一致する', JSON.stringify(decByWeb) === JSON.stringify(note));

  // 3. Web(webcrypto)で暗号化 → Node(desktop)で復号
  const encByWeb = await webEncryptJson(webKey, note);
  const decByNode = desktopCrypto.decryptJson(nodeKey, encByWeb.iv, encByWeb.payload);
  ok('Web暗号化 → Node復号 が一致する', JSON.stringify(decByNode) === JSON.stringify(note));

  // 4. keyCheck の相互検証(片方が作った keyCheck をもう片方で検証できるか)
  const keyCheckByNode = desktopCrypto.makeKeyCheck(nodeKey);
  const { iv: kcIv, payload: kcPayload } = JSON.parse(keyCheckByNode);
  const verifiedByWeb = (await webDecryptJson(webKey, kcIv, kcPayload)).check === 'zettelkasten-key-check-v1';
  ok('NodeのkeyCheckをWebが検証できる', verifiedByWeb);

  // 5. 誤ったパスフレーズでは鍵が一致しない(安全性の当然のチェック)
  const { raw: wrongRaw } = await webDeriveKey('まちがったパスフレーズ', salt);
  ok('誤パスフレーズでは異なる鍵になる', !Buffer.from(wrongRaw).equals(nodeKey));

  let failed = 0;
  for (const [label, passed] of checks) {
    if (!passed) failed++;
    console.log(`${passed ? 'OK ' : 'NG '} ${label}`);
  }
  console.log(failed === 0 ? '\nすべて成功: デスクトップ版とWeb版は暗号面で完全互換' : `\n${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
