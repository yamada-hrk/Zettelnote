// ============================================================
// Web版のフロー(登録 → アンロック → 保存 → 取得 → 復号)を
// 実際に起動中のサーバー(docker compose, :8787)に対して
// エンドツーエンドで検証するスクリプト。
// ブラウザは使わず Node の fetch + webcrypto で App.tsx と
// 同じ処理シーケンスを再現する。
//
// 前提: docker compose up -d --build 済みであること
// 実行: node web/scripts/verify-e2e.mjs
// ============================================================
import nodeCrypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scrypt } = require('scrypt-js');

const BASE = 'http://localhost:8787';
const webcrypto = nodeCrypto.webcrypto;
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) { return Buffer.from(bytes).toString('base64'); }
function unb64(b64s) { return new Uint8Array(Buffer.from(b64s, 'base64')); }

async function api(method, path, body, token) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return { status: 404, body: null };
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function deriveKey(passphrase, saltB64) {
  const raw = await scrypt(enc.encode(passphrase.normalize('NFKC')), unb64(saltB64), 16384, 8, 1, 32);
  return webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptJson(key, obj) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), payload: b64(new Uint8Array(ct)) };
}
async function decryptJson(key, ivB64, payloadB64) {
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(payloadB64));
  return JSON.parse(dec.decode(pt));
}

const checks = [];
const ok = (label, cond) => checks.push([label, !!cond]);

async function main() {
  const username = 'weba' + Date.now().toString(36);
  const password = 'password123';
  const passphrase = 'テスト用パスフレーズ';

  // 0. CORS ヘッダーが付与されているか(ブラウザからの fetch が通る前提条件)
  const corsCheck = await fetch(BASE + '/api/health', { headers: { Origin: 'http://localhost:5174' } });
  ok('CORSヘッダーが付与されている', !!corsCheck.headers.get('access-control-allow-origin'));

  // 1. 新規登録
  const reg = await api('POST', '/auth/register', { username, password });
  ok('新規登録に成功', reg.status === 200 && reg.body.token);
  const token = reg.body.token;

  // 2. アンロック(meta未初期化 → 新規salt発行 → keyCheck保存)
  const meta0 = await api('GET', '/meta', undefined, token);
  ok('初回はmeta未初期化(404)', meta0.status === 404);

  const salt = b64(webcrypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt);
  const keyCheck = JSON.stringify(await encryptJson(key, { check: 'zettelkasten-key-check-v1' }));
  const putMeta = await api('PUT', '/meta', { salt, keyCheck }, token);
  ok('meta登録に成功', putMeta.status === 200);

  // 3. メモを暗号化して保存(Push)
  const note = { title: 'Web版から作成', body: '#web版 で書いたメモ' };
  const enc1 = await encryptJson(key, { ...note, created_at: new Date().toISOString() });
  const uid = 'web-test-' + Date.now();
  const push = await api('PUT', '/notes', {
    notes: [{ uid, iv: enc1.iv, payload: enc1.payload, updatedAt: Date.now(), deleted: false }],
  }, token);
  ok('メモのPushに成功', push.status === 200 && push.body.applied === 1);

  // 4. 取得して復号(Pull)し、内容が一致するか
  const pull = await api('GET', '/notes?since=0', undefined, token);
  const rec = pull.body.notes.find((n) => n.uid === uid);
  ok('Pullでメモが取得できる', !!rec);
  const decrypted = await decryptJson(key, rec.iv, rec.payload);
  ok('復号した内容が元と一致する', decrypted.title === note.title && decrypted.body === note.body);

  // 5. 別セッションを模して再ログイン → 同じパスフレーズで同じ鍵になり、既存メモを読めるか
  const login = await api('POST', '/auth/login', { username, password });
  const token2 = login.body.token;
  const meta1 = await api('GET', '/meta', undefined, token2);
  const key2 = await deriveKey(passphrase, meta1.body.salt);
  const pull2 = await api('GET', '/notes?since=0', undefined, token2);
  const rec2 = pull2.body.notes.find((n) => n.uid === uid);
  const decrypted2 = await decryptJson(key2, rec2.iv, rec2.payload);
  ok('再ログイン後も同じ鍵で既存メモを復号できる', decrypted2.title === note.title);

  // 6. 静的配信(web/dist)がサーバーから返るか
  const staticRes = await fetch(BASE + '/');
  const staticBody = await staticRes.text();
  ok('サーバーがWeb版の静的ファイルを配信している', staticRes.status === 200 && staticBody.includes('ZettelNote'));

  let failed = 0;
  for (const [label, passed] of checks) {
    if (!passed) failed++;
    console.log(`${passed ? 'OK ' : 'NG '} ${label}`);
  }
  console.log(failed === 0 ? '\nすべて成功' : `\n${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
