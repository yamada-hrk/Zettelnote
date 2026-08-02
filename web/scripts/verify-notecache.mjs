// ============================================================
// noteCache.ts の IndexedDB ロジック(キャッシュ表示 → 差分同期)を
// fake-indexeddb で Node 上でも検証するスクリプト。
// 一時的な検証用(fake-indexeddb は --no-save でインストールしている)。
// ============================================================
import 'fake-indexeddb/auto';

const DB_NAME = 'zettelnote-cache';
const NOTES_STORE = 'notes';
const META_STORE = 'meta';
const CURSOR_KEY = 'cursor';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) db.createObjectStore(NOTES_STORE, { keyPath: 'uid' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadCachedNotes() {
  const db = await openDb();
  const notes = await new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readonly');
    const req = tx.objectStore(NOTES_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
}
async function loadCursor() {
  const db = await openDb();
  const cursor = await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(CURSOR_KEY);
    req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return cursor;
}
async function upsertCachedNote(note) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    tx.objectStore(NOTES_STORE).put(note);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function deleteCachedNote(uid) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    tx.objectStore(NOTES_STORE).delete(uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function saveCursor(cursor) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(cursor, CURSOR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function clearNoteCache() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES_STORE, META_STORE], 'readwrite');
    tx.objectStore(NOTES_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const checks = [];
const ok = (label, cond) => checks.push([label, !!cond]);

async function main() {
  // 1. 初期状態: キャッシュ空、カーソル0
  ok('初期状態: キャッシュは空', (await loadCachedNotes()).length === 0);
  ok('初期状態: カーソルは0', (await loadCursor()) === 0);

  // 2. upsert → loadCachedNotes に反映される
  await upsertCachedNote({ uid: 'a', title: 'メモA', body: '本文A', createdAt: 't1', updatedMs: 100 });
  await upsertCachedNote({ uid: 'b', title: 'メモB', body: '本文B', createdAt: 't2', updatedMs: 200 });
  let cached = await loadCachedNotes();
  ok('2件upsert後: 2件取得できる', cached.length === 2);

  // 3. 同じuidでupsert → 上書きされる(重複しない)
  await upsertCachedNote({ uid: 'a', title: 'メモA改', body: '更新後', createdAt: 't1', updatedMs: 150 });
  cached = await loadCachedNotes();
  ok('同一uidの再upsertは上書き(件数は増えない)', cached.length === 2);
  ok('上書き後の内容が反映される', cached.find((n) => n.uid === 'a').title === 'メモA改');

  // 4. カーソル保存 → 読み込みで復元
  await saveCursor(1735689600000);
  ok('カーソルが保存・復元できる', (await loadCursor()) === 1735689600000);

  // 5. delete → 取得できなくなる
  await deleteCachedNote('a');
  cached = await loadCachedNotes();
  ok('削除後は1件だけ残る', cached.length === 1 && cached[0].uid === 'b');

  // 6. clearNoteCache → メモ・カーソルとも消える(ログアウト/キー削除で使う)
  await clearNoteCache();
  ok('全消去後: メモが空になる', (await loadCachedNotes()).length === 0);
  ok('全消去後: カーソルも0に戻る', (await loadCursor()) === 0);

  let failed = 0;
  for (const [label, passed] of checks) {
    if (!passed) failed++;
    console.log(`${passed ? 'OK ' : 'NG '} ${label}`);
  }
  console.log(failed === 0 ? '\nすべて成功' : `\n${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
