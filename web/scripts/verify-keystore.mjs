// ============================================================
// keyStore.ts の IndexedDB 保存・取得ロジックを、fake-indexeddb で
// Node 上でも検証するスクリプト(CryptoKey の構造化複製が実際に
// 機能するかは重要な確認ポイントなので、思い込みではなく実行して確かめる)。
// 一時的な検証用(fake-indexeddb は --no-save でインストールしている)。
// ============================================================
import 'fake-indexeddb/auto';
import nodeCrypto from 'node:crypto';

const webcrypto = nodeCrypto.webcrypto;

const DB_NAME = 'zettelnote-keystore';
const STORE = 'keys';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveKey(username, key) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, username);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function loadKey(username) {
  const db = await openDb();
  const key = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(username);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return key;
}
async function clearKey(username) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(username);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const checks = [];
const ok = (label, cond) => checks.push([label, !!cond]);

async function main() {
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  ok('鍵は非extractableである', key.extractable === false);

  // 1. 保存 → 取得(別ユーザー名では取得できないことも確認)
  await saveKey('alice', key);
  const loaded = await loadKey('alice');
  ok('保存したキーを取得できる', loaded !== null);
  const notFound = await loadKey('bob');
  ok('別ユーザー名では取得できない', notFound === null);

  // 2. 取得したキーが実際に暗号化/復号に使えるか(構造化複製後も機能するか)
  const plaintext = { title: 'IndexedDBテスト', body: '保存したキーで復号できるか確認' };
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(plaintext)));
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, loaded, ct);
  const decrypted = JSON.parse(dec.decode(pt));
  ok('取得したキーで実際に復号できる(構造化複製後も機能する)', JSON.stringify(decrypted) === JSON.stringify(plaintext));

  // 3. 削除後は取得できない
  await clearKey('alice');
  const afterClear = await loadKey('alice');
  ok('削除後は取得できない', afterClear === null);

  let failed = 0;
  for (const [label, passed] of checks) {
    if (!passed) failed++;
    console.log(`${passed ? 'OK ' : 'NG '} ${label}`);
  }
  console.log(failed === 0 ? '\nすべて成功' : `\n${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
