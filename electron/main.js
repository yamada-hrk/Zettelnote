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
const { extractTags } = require('./tags');

/** メインウィンドウの参照(GC防止のため保持) */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'ローカル・ツェッテルカステン',
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
  registerIpcHandlers();
  createWindow();

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
  // メモ一覧(メタ情報 + 本文から抽出したハッシュタグ)
  ipcMain.handle('notes:list', () =>
    db.listNotesWithBody().map(({ body, ...meta }) => ({
      ...meta,
      preview: body.slice(0, 60),
      tags: extractTags(body),
    }))
  );

  // メモ1件取得
  ipcMain.handle('notes:get', (_e, id) => db.getNote(id));

  // 新規メモ作成
  ipcMain.handle('notes:create', () => db.createNote());

  // メモ更新(タイトル・本文)
  ipcMain.handle('notes:update', (_e, id, patch) => db.updateNote(id, patch));

  // メモ削除
  ipcMain.handle('notes:delete', (_e, id) => db.deleteNote(id));

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

    return {
      vector: withSharedTags(search.vectorSearch(text, docs, 10)),
      keyword: search.keywordSearch(text, docs, 10),
    };
  });
}
