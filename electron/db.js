// ============================================================
// SQLite データアクセス層 (better-sqlite3)
// - メモの CRUD と永続化を担当する
// - 完全ローカル: DB ファイルはユーザーデータ領域に置かれる
//
// ■ Step2(サーバー同期)対応
//   - uid:        端末をまたいでメモを同定するための UUID
//   - updated_ms: LWW(Last-Write-Wins)競合解決用の更新時刻(epoch ms)
//   - tombstones: 削除の記録(削除を他端末へ伝搬するための墓標)
// ============================================================
const path = require('path');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');

/** @type {import('better-sqlite3').Database} */
let db = null;

/** epoch ms → 'YYYY-MM-DD HH:MM:SS'(ローカル時刻の表示用文字列) */
function msToLocal(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * DB を初期化する(アプリ起動時に一度だけ呼ぶ)
 * @param {string} userDataDir 保存先ディレクトリ
 */
function init(userDataDir) {
  const file = path.join(userDataDir, 'zettelkasten.db');
  db = new Database(file);
  // WAL モード: 書き込み中も読み取りをブロックしない(体感速度の向上)
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL DEFAULT '',
      body       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
  `);

  // ---- マイグレーション: 同期用カラムと削除記録テーブル ----
  const cols = db
    .prepare(`PRAGMA table_info(notes)`)
    .all()
    .map((c) => c.name);
  if (!cols.includes('uid')) {
    db.exec(`ALTER TABLE notes ADD COLUMN uid TEXT`);
  }
  if (!cols.includes('updated_ms')) {
    db.exec(`ALTER TABLE notes ADD COLUMN updated_ms INTEGER`);
  }
  // 既存メモへのバックフィル
  // (updated_ms は現在時刻にする → 初回同期で全メモがサーバーへ Push される)
  const missing = db.prepare(`SELECT id FROM notes WHERE uid IS NULL`).all();
  const fillUid = db.prepare(`UPDATE notes SET uid = ? WHERE id = ?`);
  for (const r of missing) fillUid.run(randomUUID(), r.id);
  db.prepare(`UPDATE notes SET updated_ms = ? WHERE updated_ms IS NULL`).run(
    Date.now()
  );
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_uid ON notes(uid);
    CREATE TABLE IF NOT EXISTS tombstones (
      uid        TEXT PRIMARY KEY,
      deleted_ms INTEGER NOT NULL
    );
  `);
}

/**
 * 全メモを本文込みで更新日時の降順で返す
 * (一覧のメタ情報整形・タグ抽出・検索の共通ソース)
 */
function listNotesWithBody() {
  return db
    .prepare(
      `SELECT id, title, body, updated_at
       FROM notes ORDER BY updated_at DESC, id DESC`
    )
    .all();
}

/** メモを1件取得 */
function getNote(id) {
  return db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) ?? null;
}

/** 新規メモを作成して返す */
function createNote() {
  const info = db
    .prepare(`INSERT INTO notes (title, body, uid, updated_ms) VALUES ('', '', ?, ?)`)
    .run(randomUUID(), Date.now());
  return getNote(info.lastInsertRowid);
}

/**
 * メモを更新する
 * @param {number} id
 * @param {{ title?: string, body?: string }} patch
 */
function updateNote(id, patch) {
  const current = getNote(id);
  if (!current) return null;
  db.prepare(
    `UPDATE notes
     SET title = ?, body = ?, updated_at = datetime('now', 'localtime'), updated_ms = ?
     WHERE id = ?`
  ).run(patch.title ?? current.title, patch.body ?? current.body, Date.now(), id);
  return getNote(id);
}

/** メモを削除する(同期用に墓標を残す) */
function deleteNote(id) {
  const note = getNote(id);
  if (note && note.uid) {
    db.prepare(
      `INSERT INTO tombstones (uid, deleted_ms) VALUES (?, ?)
       ON CONFLICT (uid) DO UPDATE SET deleted_ms = excluded.deleted_ms`
    ).run(note.uid, Date.now());
  }
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
  return { ok: true };
}

// ------------------------------------------------------------
// 同期用ヘルパー(electron/sync.js から使用)
// ------------------------------------------------------------

/** 指定時刻より後に更新されたメモを返す(Push 対象) */
function listChangedSince(ms) {
  return db.prepare(`SELECT * FROM notes WHERE updated_ms > ?`).all(ms);
}

/** 指定時刻より後に削除された墓標を返す(Push 対象) */
function listTombstonesSince(ms) {
  return db.prepare(`SELECT * FROM tombstones WHERE deleted_ms > ?`).all(ms);
}

/** uid の墓標を取得(リモート更新の適用可否判定に使う) */
function getTombstone(uid) {
  return db.prepare(`SELECT * FROM tombstones WHERE uid = ?`).get(uid) ?? null;
}

/**
 * リモートのメモをローカルへ適用する(LWW)
 * ローカルの方が新しい(または同時刻の)場合は何もしない
 * @returns {boolean} 適用したかどうか
 */
function applyRemoteUpsert({ uid, title, body, createdAt, updatedMs }) {
  const existing = db
    .prepare(`SELECT id, updated_ms FROM notes WHERE uid = ?`)
    .get(uid);
  if (existing) {
    if (existing.updated_ms >= updatedMs) return false;
    db.prepare(
      `UPDATE notes SET title = ?, body = ?, updated_at = ?, updated_ms = ? WHERE uid = ?`
    ).run(title, body, msToLocal(updatedMs), updatedMs, uid);
  } else {
    db.prepare(
      `INSERT INTO notes (title, body, uid, created_at, updated_at, updated_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      body,
      uid,
      createdAt || msToLocal(updatedMs),
      msToLocal(updatedMs),
      updatedMs
    );
  }
  return true;
}

/**
 * リモートの削除をローカルへ適用する(墓標も記録して再 Push を防ぐ)
 * @returns {boolean} ローカルのメモを実際に削除したかどうか
 */
function applyRemoteDelete(uid, deletedMs) {
  const existing = db
    .prepare(`SELECT id, updated_ms FROM notes WHERE uid = ?`)
    .get(uid);
  db.prepare(
    `INSERT INTO tombstones (uid, deleted_ms) VALUES (?, ?)
     ON CONFLICT (uid) DO UPDATE SET deleted_ms = excluded.deleted_ms
     WHERE tombstones.deleted_ms < excluded.deleted_ms`
  ).run(uid, deletedMs);
  if (!existing) return false;
  // ローカルの方が新しく編集されている場合は削除しない(編集が勝つ)
  if (existing.updated_ms > deletedMs) return false;
  db.prepare(`DELETE FROM notes WHERE uid = ?`).run(uid);
  return true;
}

module.exports = {
  init,
  listNotesWithBody,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  listChangedSince,
  listTombstonesSince,
  getTombstone,
  applyRemoteUpsert,
  applyRemoteDelete,
};
