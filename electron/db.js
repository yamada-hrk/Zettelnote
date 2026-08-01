// ============================================================
// SQLite データアクセス層 (better-sqlite3)
// - メモの CRUD と永続化を担当する
// - 完全ローカル: DB ファイルはユーザーデータ領域に置かれる
// ============================================================
const path = require('path');
const Database = require('better-sqlite3');

/** @type {import('better-sqlite3').Database} */
let db = null;

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
}

/** メモ一覧(本文を含まないメタ情報)を更新日時の降順で返す */
function listNotes() {
  return db
    .prepare(
      `SELECT id, title, updated_at, substr(body, 1, 60) AS preview
       FROM notes ORDER BY updated_at DESC, id DESC`
    )
    .all();
}

/** 検索用: 全メモを本文込みで返す */
function listNotesWithBody() {
  return db.prepare(`SELECT id, title, body FROM notes`).all();
}

/** メモを1件取得 */
function getNote(id) {
  return db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) ?? null;
}

/** 新規メモを作成して返す */
function createNote() {
  const info = db
    .prepare(`INSERT INTO notes (title, body) VALUES ('', '')`)
    .run();
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
     SET title = ?, body = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(patch.title ?? current.title, patch.body ?? current.body, id);
  return getNote(id);
}

/** メモを削除する */
function deleteNote(id) {
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
  return { ok: true };
}

module.exports = {
  init,
  listNotes,
  listNotesWithBody,
  getNote,
  createNote,
  updateNote,
  deleteNote,
};
