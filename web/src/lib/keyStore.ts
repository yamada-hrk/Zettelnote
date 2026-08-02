// ============================================================
// 暗号化キーのブラウザ保持(IndexedDB, 非extractable CryptoKey)
//
// SubtleCrypto の CryptoKey オブジェクトは IndexedDB に直接保存できる
// (構造化複製アルゴリズムが CryptoKey をサポートしている)。
// webCrypto.ts の deriveKey() は extractable: false で鍵を導出して
// いるため、保存後も生の鍵バイト列は一切 JS から取得できない
// (できるのは「暗号化/復号に使う」ことだけ)。
//
// ユーザーの明示的な選択(UnlockScreen のチェックボックス)でのみ
// 保存し、ログアウト・「記憶を削除」操作で必ず消せるようにしている
// (詳細は仕様書 §11 参照)。
// ============================================================
const DB_NAME = 'zettelnote-keystore';
const STORE = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** アカウント(username)ごとに1件、暗号化キーを保存する */
export async function saveKey(username: string, key: CryptoKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, username);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** 保存済みの暗号化キーを取得する(無ければ null。取得失敗時も null) */
export async function loadKey(username: string): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    const key = await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(username);
      req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return key;
  } catch {
    return null;
  }
}

/** 保存済みの暗号化キーを削除する */
export async function clearKey(username: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(username);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 削除に失敗しても致命的ではない(次回の保存で上書きされる)
  }
}
