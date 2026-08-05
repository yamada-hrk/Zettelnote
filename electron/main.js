// ============================================================
// Electron メインプロセス
// - ウィンドウ生成
// - SQLite(better-sqlite3) の初期化
// - レンダラーからの IPC 要求(CRUD / レコメンド検索)の処理
// ============================================================
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./db');
const search = require('./search');
const sync = require('./sync');
const { extractTags } = require('./tags');
const { getCatalogEntry, DEFAULT_MODEL_ID } = require('./embeddingCatalog');

/** メインウィンドウの参照(GC防止のため保持) */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'ローカル・ツェッテルカステン',
    // タイトルバー/タスクバーのアイコン(パッケージ版の実行ファイル
    // アイコンは electron-builder.yml の win.icon で別途指定している)
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      // セキュリティ: レンダラーには preload 経由の API のみ公開する
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 開発時は Vite の開発サーバー、本番時はビルド済み HTML を読み込む
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // DB ファイルは OS 標準のユーザーデータ領域に保存する
  // (例: C:\Users\<name>\AppData\Roaming\zettelkasten-local\zettelkasten.db)
  db.init(app.getPath('userData'));
  // 同期エンジン初期化(ステータス変化はレンダラーへプッシュ通知)
  sync.init(app.getPath('userData'), (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', status);
    }
  });
  registerIpcHandlers();
  createWindow();

  // 起動直後に一度同期し、以降は60秒ごとの定期同期(未設定なら何もしない)
  sync.requestSync(3000);
  setInterval(() => sync.requestSync(0), 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// すべてのウィンドウが閉じたら終了(Windows の標準的な挙動)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------------------------------------------------
// IPC ハンドラ登録
// ------------------------------------------------------------
function registerIpcHandlers() {
  /** 本文込みの行 → 一覧用メタ情報(プレビュー + タグ)に整形する */
  const toMeta = ({ body, ...meta }) => ({
    ...meta,
    preview: body.slice(0, 60),
    tags: extractTags(body),
  });

  // メモ一覧(メタ情報 + 本文から抽出したハッシュタグ)
  ipcMain.handle('notes:list', () => db.listNotesWithBody().map(toMeta));

  // キーワード検索(左ペインの絞り込み。部分一致・複数語 AND)
  ipcMain.handle('notes:search', (_e, query) => {
    if (!query || !query.trim()) return [];
    return search.keywordFilter(query, db.listNotesWithBody()).map(toMeta);
  });

  // メモ1件取得
  ipcMain.handle('notes:get', (_e, id) => db.getNote(id));

  // 新規メモ作成
  ipcMain.handle('notes:create', () => {
    const note = db.createNote();
    sync.requestSync();
    return note;
  });

  // メモ更新(タイトル・本文)。変更はデバウンス付きでサーバーへ同期
  ipcMain.handle('notes:update', (_e, id, patch) => {
    const note = db.updateNote(id, patch);
    sync.requestSync();
    return note;
  });

  // メモ削除(墓標を残して削除を他端末へ伝搬)
  ipcMain.handle('notes:delete', (_e, id) => {
    const result = db.deleteNote(id);
    sync.requestSync();
    return result;
  });

  // レコメンド検索(ベクトル一致・キーワード一致の両方を一度に返す)
  ipcMain.handle('notes:recommend', (_e, payload) => {
    const { excludeId, text } = payload;
    // 空テキストなら空の結果を返す(無駄な計算を避ける)
    if (!text || !text.trim()) {
      return { vector: [], keyword: [] };
    }
    // 検索対象: 編集中のメモを除く全メモ
    const docs = db
      .listNotesWithBody()
      .filter((n) => n.id !== excludeId);

    // ベクトル検索結果には編集中テキストと共通のハッシュタグを付与する
    // (キーワード検索はタグ優先ソートのため search.js 内部で算出済み)
    const queryTags = extractTags(text);
    const tagsById = new Map(docs.map((d) => [d.id, extractTags(d.body)]));
    const withSharedTags = (items) =>
      items.map((item) => ({
        ...item,
        sharedTags: queryTags.filter((t) =>
          (tagsById.get(item.id) || []).includes(t)
        ),
      }));

    // 意味的類似(ベクトル検索)はモデルカタログ経由で呼び出す。
    // フェーズ1時点ではアカウント設定(activeEmbeddingModel)がまだ
    // 存在しないため既定エントリ(バイグラム)固定だが、将来モデルを
    // 追加してもここを差し替える必要はない
    const modelEntry = getCatalogEntry(DEFAULT_MODEL_ID);
    return {
      vector: withSharedTags(modelEntry.vectorSearch(text, docs, 10)),
      keyword: search.keywordSearch(text, docs, 10),
    };
  });

  // ---- サーバー同期(Step2) ----

  // 同期ステータス取得
  ipcMain.handle('sync:get-status', () => sync.getStatus());

  // 保存済みパスフレーズの復元(設定画面のプリフィル用・ログイン中のみ)
  ipcMain.handle('sync:get-passphrase', () => sync.getPassphrase());

  // 同期設定(サーバー URL / トークン / 暗号化パスフレーズ)
  ipcMain.handle('sync:configure', (_e, payload) => sync.configure(payload));

  // 手動同期
  ipcMain.handle('sync:now', () => {
    sync.requestSync(0);
    return true;
  });

  // 同期解除(ローカルのメモは残る)
  ipcMain.handle('sync:disable', () => {
    sync.disable();
    return true;
  });
}
