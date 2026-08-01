// ============================================================
// サーバー同期エンジン(メインプロセス)
//
// ■ ゼロ知識の担保
//   - パスフレーズから導出した鍵はこのプロセスのメモリにのみ保持
//   - サーバーへ送るのは暗号文(AES-256-GCM) + IV のみ
//   - パスフレーズ自体は Electron safeStorage(OS の資格情報保護)で
//     暗号化してローカル設定ファイルに保存(サーバーには送らない)
//
// ■ 同期フロー(syncNow)
//   1. Pull: 前回同期以降のリモート変更を取得 → 復号 → LWW でローカル適用
//   2. Push: 前回同期以降のローカル変更 + 削除墓標を暗号化して一括送信
//   3. カーソル(lastSyncMs)をサーバー時刻で更新
//
// ■ 起動トリガー
//   - メモの保存/作成/削除後(requestSync: 4秒デバウンス)
//   - 60秒ごとの定期実行
//   - 設定完了直後 / 手動「今すぐ同期」
//
// ■ ハイブリッド設計(ローカルファースト)
//   同期は完全なオプトイン。ログインしていない間(configured: false)は
//   このモジュールは一切ネットワーク通信を行わず、アプリは
//   ローカルのみで全機能が動作する。認証はアカウント制
//   (新規登録 / ログイン → サーバーが発行するトークンを保存)。
//   アカウントのパスワード(サーバー認証用)と暗号化キー(端末内のみ)は
//   独立しており、暗号化キーがサーバーへ送られることはない。
// ============================================================
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const db = require('./db');
const {
  generateSalt,
  deriveKey,
  encryptJson,
  decryptJson,
  makeKeyCheck,
  verifyKeyCheck,
} = require('./crypto');

/** 設定ファイルのパス(userData/sync-config.json) */
let configPath = null;
/** { serverUrl, username, token, salt, passEnc, lastSyncMs } */
let config = null;
/** 導出済みの暗号化キー(メモリ内のみ・永続化しない) */
let key = null;

let syncing = false;
let pendingResync = false;
let lastError = null;
let lastSyncAt = null;
let debounceTimer = null;
/** ステータス変化をレンダラーへ通知するコールバック */
let notify = () => {};

function init(userDataDir, notifyFn) {
  configPath = path.join(userDataDir, 'sync-config.json');
  notify = notifyFn;
  loadConfig();
}

/** 保存済み設定を読み込み、safeStorage からパスフレーズを復元して鍵を再導出する */
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    config = null;
    return;
  }
  key = null;
  try {
    if (config.passEnc && config.salt && safeStorage.isEncryptionAvailable()) {
      const pass = safeStorage.decryptString(Buffer.from(config.passEnc, 'base64'));
      key = deriveKey(pass, config.salt);
    }
  } catch {
    // 復元に失敗した場合は再設定が必要(configured: false になる)
    key = null;
  }
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config));
}

/** 現在の同期ステータス(レンダラー表示用) */
function getStatus(extra = {}) {
  return {
    configured: !!(config && config.token && key),
    syncing,
    lastSyncAt,
    lastError,
    serverUrl: config ? config.serverUrl : null,
    account: config ? config.username || null : null,
    ...extra,
  };
}

/** API 呼び出し(token を渡すと Bearer 認証付き) */
async function request(serverUrl, method, pathname, body, token) {
  const res = await fetch(serverUrl.replace(/\/$/, '') + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    // サーバーが返す日本語エラーメッセージを優先して表示する
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `サーバーエラー (HTTP ${res.status})`);
  }
  return res.json();
}

/** 設定済み接続での API 呼び出し */
function api(method, pathname, body) {
  return request(config.serverUrl, method, pathname, body, config.token);
}

/**
 * 同期を設定して接続確認する(オプトイン: ここで初めてサーバー通信が発生する)
 * @param {{ serverUrl: string, username: string, password: string,
 *           passphrase: string, register: boolean }} opts
 *   - username/password: サーバー認証用のアカウント情報
 *   - passphrase: 暗号化キー(サーバーへは送らない)
 *   - register: true なら新規登録、false ならログイン
 * @returns {{ ok: boolean, error?: string }}
 */
async function configure({ serverUrl, username, password, passphrase, register }) {
  const prev = { config, key };
  try {
    if (!serverUrl || !username || !password || !passphrase) {
      throw new Error('すべての項目を入力してください');
    }
    const url = serverUrl.replace(/\/$/, '');
    // 1. アカウント認証(新規登録 or ログイン)→ トークン取得
    const auth = await request(
      url,
      'POST',
      register ? '/api/auth/register' : '/api/auth/login',
      { username, password }
    );
    config = {
      serverUrl: url,
      username: auth.username,
      token: auth.token,
      salt: null,
      passEnc: null,
      lastSyncMs: 0,
    };
    // 2. 鍵導出メタ情報を取得(未初期化なら salt を新規登録)
    let meta = await api('GET', '/api/meta');
    if (!meta) {
      const salt = generateSalt();
      const k = deriveKey(passphrase, salt);
      // PUT は「既存があれば既存を返す」ため、競合しても安全
      meta = await api('PUT', '/api/meta', { salt, keyCheck: makeKeyCheck(k) });
    }
    const k = deriveKey(passphrase, meta.salt);
    if (!verifyKeyCheck(k, meta.keyCheck)) {
      throw new Error('暗号化キーが一致しません(このアカウントの既存データと異なるキーです)');
    }
    key = k;
    config.salt = meta.salt;
    // パスフレーズは OS の資格情報保護で暗号化してローカルにのみ保存
    if (safeStorage.isEncryptionAvailable()) {
      config.passEnc = safeStorage.encryptString(passphrase).toString('base64');
    }
    lastError = null;
    saveConfig();
    notify(getStatus());
    void syncNow();
    return { ok: true };
  } catch (e) {
    config = prev.config;
    key = prev.key;
    const msg = /fetch failed/i.test(String(e.message))
      ? 'サーバーに接続できません(URL と起動状態を確認してください)'
      : e.message;
    return { ok: false, error: msg };
  }
}

/**
 * 保存済みのパスフレーズを復元して返す(設定画面のプリフィル用)
 * ログイン中(設定済み)のみ返す。safeStorage が使えない環境では null
 */
function getPassphrase() {
  if (!config || !config.token || !config.passEnc) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(config.passEnc, 'base64'));
  } catch {
    return null;
  }
}

/** 同期設定を解除する(ローカルのメモは残る) */
function disable() {
  config = null;
  key = null;
  lastError = null;
  lastSyncAt = null;
  try {
    fs.rmSync(configPath, { force: true });
  } catch {
    // 設定ファイルが消せなくても動作は継続する
  }
  notify(getStatus());
}

/** デバウンス付きの同期リクエスト(保存のたびに呼ばれる想定) */
function requestSync(delayMs = 4000) {
  if (!config || !config.token || !key) return; // 未ログイン(ローカルモード)では何もしない
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void syncNow(), delayMs);
}

/** 同期本体(Pull → Push) */
async function syncNow() {
  if (!config || !config.token || !key) return; // 未ログイン(ローカルモード)では何もしない
  if (syncing) {
    pendingResync = true; // 実行中なら完了後にもう一度
    return;
  }
  syncing = true;
  notify(getStatus());
  try {
    const since = config.lastSyncMs || 0;

    // ---- 1. Pull: リモート変更を復号してローカルへ適用 ----
    const remote = await api('GET', `/api/notes?since=${since}`);
    let pulled = 0;
    for (const rec of remote.notes) {
      if (rec.deleted) {
        if (db.applyRemoteDelete(rec.uid, rec.updatedAt)) pulled++;
        continue;
      }
      // ローカルで削除済み(墓標の方が新しい)なら適用しない
      const tomb = db.getTombstone(rec.uid);
      if (tomb && tomb.deleted_ms >= rec.updatedAt) continue;
      let plain;
      try {
        plain = decryptJson(key, rec.iv, rec.payload);
      } catch {
        continue; // 復号できないレコードはスキップ(鍵変更・破損など)
      }
      const applied = db.applyRemoteUpsert({
        uid: rec.uid,
        title: plain.title || '',
        body: plain.body || '',
        createdAt: plain.created_at,
        updatedMs: rec.updatedAt,
      });
      if (applied) pulled++;
    }

    // ---- 2. Push: ローカル変更 + 削除墓標を暗号化して送信 ----
    const payload = [
      ...db.listChangedSince(since).map((n) => {
        const enc = encryptJson(key, {
          title: n.title,
          body: n.body,
          created_at: n.created_at,
        });
        return {
          uid: n.uid,
          iv: enc.iv,
          payload: enc.payload,
          updatedAt: n.updated_ms,
          deleted: false,
        };
      }),
      ...db.listTombstonesSince(since).map((t) => ({
        uid: t.uid,
        iv: null,
        payload: null,
        updatedAt: t.deleted_ms,
        deleted: true,
      })),
    ];
    if (payload.length > 0) {
      await api('PUT', '/api/notes', { notes: payload });
    }

    // ---- 3. カーソル更新(サーバー時刻基準 → 端末間の時計ずれに強い) ----
    config.lastSyncMs = remote.serverNow;
    saveConfig();
    lastError = null;
    lastSyncAt = Date.now();
    syncing = false;
    notify(getStatus({ pulled }));
  } catch (e) {
    syncing = false;
    lastError = /fetch failed/i.test(String(e.message))
      ? 'サーバーに接続できません'
      : e.message;
    notify(getStatus());
  } finally {
    if (pendingResync) {
      pendingResync = false;
      requestSync(1000);
    }
  }
}

module.exports = {
  init,
  getStatus,
  getPassphrase,
  configure,
  disable,
  requestSync,
  syncNow,
};
