// ============================================================
// 同期 API サーバー(ゼロ知識ストア + アカウント認証)
//
// サーバーが保存するのは「クライアント側で AES-256-GCM 暗号化済みの
// ペイロード」のみ。平文・暗号化キー・パスフレーズは一切受け取らない。
// アカウントのパスワードは認証専用(scrypt ハッシュで保存)で、
// メモの暗号化キーとは独立している。
//
// ■ エンドポイント
//   POST /api/auth/register 新規アカウント登録 → トークン発行
//   POST /api/auth/login    ログイン → トークン発行
//   GET  /api/health        死活確認(認証不要)
//   以下は Bearer トークン認証 + ユーザーごとにデータ分離:
//   GET  /api/meta          鍵導出用メタ情報(salt / keyCheck)
//   PUT  /api/meta          メタ情報を初期登録(既存があれば既存を返す)
//   GET  /api/notes?since=  server_ms > since のレコードを返す(Pull)
//   PUT  /api/notes         レコードを一括アップサート(Push / LWW)
//
// ■ 競合解決: Last-Write-Wins
//   クライアントが付与した updated_ms が新しい方を採用する。
//   Pull の差分カーソルにはサーバー側の受信時刻(server_ms)を使う
//   (クライアント間の時計ずれの影響を受けないようにするため)。
//
// ■ Web版クライアントへの対応
//   Web版はブラウザから直接この API を叩く(クロスオリジンになり得る)ため
//   CORS を有効化している。認証は Cookie ではなく Bearer トークンなので
//   CSRF の懸念がなく、オリジンをオープンにしても安全性は損なわれない
//   (自己ホスト前提の個人利用サーバーであることも踏まえた判断)。
//   ビルド済みの Web アプリ(web/dist)が存在する場合は、このサーバー
//   自身が静的ファイルとして配信する(同一オリジンになるため本番では
//   実質 CORS は不要になるが、開発時の Vite dev server 用に残している)
// ============================================================
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 8787);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

/** 非同期ハンドラのエラーを error handler へ流すラッパー(next も転送する) */
const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ------------------------------------------------------------
// パスワードハッシュ(scrypt + ランダム salt)
// ------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, 32);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [saltB64, hashB64] = stored.split(':');
    const hash = crypto.scryptSync(
      password.normalize('NFKC'),
      Buffer.from(saltB64, 'base64'),
      32
    );
    return crypto.timingSafeEqual(hash, Buffer.from(hashB64, 'base64'));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// レートリミット(総当たり攻撃対策)
// ------------------------------------------------------------

/**
 * 認証エンドポイント用: 同一 IP あたり 15分間に失敗10回まで
 * 成功したリクエストはカウントしない(正規ユーザーを閉め出さない)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7', // RateLimit-* ヘッダーで残回数を通知
  legacyHeaders: false,
  message: {
    error: '試行回数が上限に達しました。15分ほど待ってからやり直してください',
  },
});

/** データ系 API 用: 同一 IP あたり 1分間に120回まで(通常同期では到達しない) */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'リクエストが多すぎます。しばらく待ってからやり直してください',
  },
});

// ------------------------------------------------------------
// 認証エンドポイント
// ------------------------------------------------------------
async function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sessions (token, user_id, created_ms) VALUES ($1, $2, $3)',
    [token, userId, Date.now()]
  );
  return token;
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[a-z0-9_-]{3,32}$/i.test(username)) {
    return 'アカウント名は3〜32文字の英数字・ハイフン・アンダースコアで入力してください';
  }
  if (typeof password !== 'string' || password.length < 8) {
    return 'パスワードは8文字以上で入力してください';
  }
  return null;
}

app.post(
  '/api/auth/register',
  authLimiter,
  ah(async (req, res) => {
    const { username, password } = req.body || {};
    const invalid = validateCredentials(username, password);
    if (invalid) return res.status(400).json({ error: invalid });
    const r = await pool.query(
      `INSERT INTO users (username, pass_hash, created_ms) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [username.toLowerCase(), hashPassword(password), Date.now()]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({ error: 'このアカウント名は既に使われています' });
    }
    res.json({ token: await issueToken(r.rows[0].id), username: username.toLowerCase() });
  })
);

app.post(
  '/api/auth/login',
  authLimiter,
  ah(async (req, res) => {
    const { username, password } = req.body || {};
    const r = await pool.query('SELECT id, pass_hash FROM users WHERE username = $1', [
      String(username || '').toLowerCase(),
    ]);
    if (r.rows.length === 0 || !verifyPassword(String(password || ''), r.rows[0].pass_hash)) {
      return res
        .status(401)
        .json({ error: 'アカウント名またはパスワードが違います' });
    }
    res.json({ token: await issueToken(r.rows[0].id), username: String(username).toLowerCase() });
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, serverNow: Date.now() });
});

// ---- 認証ミドルウェア(トークン → user_id を解決) ----
app.use('/api', apiLimiter);
app.use(
  '/api',
  ah(async (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'ログインが必要です' });
    const r = await pool.query('SELECT user_id FROM sessions WHERE token = $1', [token]);
    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'セッションが無効です。再ログインしてください' });
    }
    req.userId = r.rows[0].user_id;
    next();
  })
);

// ---- 鍵導出メタ情報(ユーザーごと。salt は秘密ではないため保存可) ----
app.get(
  '/api/meta',
  ah(async (req, res) => {
    const r = await pool.query(
      'SELECT salt, key_check FROM sync_meta WHERE user_id = $1',
      [req.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'not initialized' });
    res.json({ salt: r.rows[0].salt, keyCheck: r.rows[0].key_check });
  })
);

app.put(
  '/api/meta',
  ah(async (req, res) => {
    const { salt, keyCheck } = req.body || {};
    if (typeof salt !== 'string' || typeof keyCheck !== 'string') {
      return res.status(400).json({ error: '入力内容が不正です' });
    }
    // 既に初期化済みなら上書きしない(既存の salt を壊すと全データが復号不能になる)
    await pool.query(
      `INSERT INTO sync_meta (user_id, salt, key_check) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [req.userId, salt, keyCheck]
    );
    const r = await pool.query(
      'SELECT salt, key_check FROM sync_meta WHERE user_id = $1',
      [req.userId]
    );
    res.json({ salt: r.rows[0].salt, keyCheck: r.rows[0].key_check });
  })
);

// ---- Pull: 前回同期以降にサーバーが受信したレコードを返す ----
app.get(
  '/api/notes',
  ah(async (req, res) => {
    const since = Number(req.query.since || 0);
    const r = await pool.query(
      `SELECT uid, payload, iv, updated_ms, deleted
       FROM sync_notes WHERE user_id = $1 AND server_ms > $2 ORDER BY server_ms`,
      [req.userId, since]
    );
    res.json({
      serverNow: Date.now(),
      notes: r.rows.map((x) => ({
        uid: x.uid,
        payload: x.payload,
        iv: x.iv,
        updatedAt: Number(x.updated_ms),
        deleted: x.deleted,
      })),
    });
  })
);

// ---- Push: LWW アップサート(updated_ms が新しい場合のみ上書き) ----
app.put(
  '/api/notes',
  ah(async (req, res) => {
    const notes = (req.body && req.body.notes) || [];
    const now = Date.now();
    let applied = 0;
    for (const n of notes) {
      if (typeof n.uid !== 'string' || typeof n.updatedAt !== 'number') continue;
      const r = await pool.query(
        `INSERT INTO sync_notes (user_id, uid, payload, iv, updated_ms, deleted, server_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, uid) DO UPDATE SET
           payload = EXCLUDED.payload,
           iv = EXCLUDED.iv,
           updated_ms = EXCLUDED.updated_ms,
           deleted = EXCLUDED.deleted,
           server_ms = EXCLUDED.server_ms
         WHERE sync_notes.updated_ms < EXCLUDED.updated_ms`,
        [req.userId, n.uid, n.payload ?? null, n.iv ?? null, n.updatedAt, !!n.deleted, now]
      );
      applied += r.rowCount;
    }
    res.json({ serverNow: now, applied });
  })
);

// ---- Web版アプリの配信(web/dist をビルドしてあれば静的配信する) ----
// Docker イメージ内では web/dist を同梱するため、API サーバーと
// Web アプリを同一オリジン・単一コンテナで提供できる(CORS も不要になる)
const webDist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// ---- エラーハンドラ ----
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'サーバー内部エラー' });
});

// ---- 起動: テーブル初期化 → listen ----
async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   TEXT NOT NULL UNIQUE,
      pass_hash  TEXT NOT NULL,
      created_ms BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_ms BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      salt      TEXT NOT NULL,
      key_check TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_notes (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uid        TEXT NOT NULL,
      payload    TEXT,
      iv         TEXT,
      updated_ms BIGINT NOT NULL,
      deleted    BOOLEAN NOT NULL DEFAULT FALSE,
      server_ms  BIGINT NOT NULL,
      PRIMARY KEY (user_id, uid)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_notes_server ON sync_notes(user_id, server_ms);
  `);
  app.listen(PORT, () => console.log(`sync server listening on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
