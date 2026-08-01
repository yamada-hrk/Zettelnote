# ローカル完結型ツェッテルカステン・メモアプリ(ステップ1)

ネットワーク接続を一切必要とせず、完全ローカル環境で動作するメモアプリのプロトタイプです。
編集中のテキストに対して、過去のメモをリアルタイムでレコメンドします。

## 技術スタックと選定理由

| 項目 | 採用技術 | 選定理由 |
|---|---|---|
| フレームワーク | **Electron 43** | 開発マシンに Rust ツールチェーンが未導入のため、Node.js のみで即座に構築できる Electron を採用。IPC 境界(preload API)を薄く保ってあるため、将来 Tauri へ移行する場合もフロントエンドはそのまま流用可能 |
| フロントエンド | React 19 / TypeScript / Tailwind CSS v4 | 仕様指定どおり。Tailwind v4 は設定ファイル不要で Vite プラグインのみで動作 |
| ビルド | Vite 8 | 高速な HMR。`base: './'` 設定で Electron の `file://` 読み込みにも対応 |
| DB | SQLite (**better-sqlite3**) | 同期 API で高速・堅牢。Electron 用プリビルドバイナリで動作確認済み(ネイティブビルド不要) |
| 検索 | 文字バイグラム TF-IDF + コサイン類似度(自前実装) | 「ネットワーク接続を一切必要としない」要件を厳守するため、モデルダウンロードが必要な埋め込みモデルはステップ1では見送り。日本語を分かち書きなしで扱える文字バイグラム方式を採用。`electron/search.js` の `vectorSearch()` を差し替えるだけでローカル埋め込みモデル(例: multilingual-e5-small + ONNX Runtime)へ移行できる構造 |

## ディレクトリ構成

```
Zettelkasten/
├── electron/               # メインプロセス(CommonJS・ビルド不要)
│   ├── main.js             # ウィンドウ生成・IPC ハンドラ登録
│   ├── preload.js          # contextBridge で window.api を安全に公開
│   ├── db.js               # SQLite データアクセス層(CRUD)
│   └── search.js           # ベクトル検索・キーワード検索(完全ローカル)
├── src/                    # レンダラー(React / TypeScript)
│   ├── main.tsx            # エントリポイント
│   ├── App.tsx             # 3カラムレイアウト・状態管理・自動保存
│   ├── components/
│   │   ├── NoteList.tsx    # 左: メモ一覧
│   │   ├── Editor.tsx      # 中央: Markdown エディタ + プレビュー
│   │   └── RecommendSidebar.tsx  # 右: レコメンド(タブ / グラデーションUI / ホバー演出)
│   ├── hooks/
│   │   └── useDebounce.ts  # デバウンス処理
│   ├── types.ts            # 共有型定義
│   ├── global.d.ts         # window.api の型定義
│   └── index.css           # Tailwind + Markdown プレビュー用スタイル
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## セットアップと起動

```powershell
# 依存関係のインストール(初回のみ)
npm install

# 開発モードで起動(Vite 開発サーバー + Electron / HMR 有効)
npm run dev

# 本番ビルドして起動
npm start
```

DB ファイルは `%APPDATA%\zettelkasten-local\zettelkasten.db` に保存されます。

## 実装済み機能(ステップ1スコープ)

### ① メモの CRUD
- Markdown 形式での作成・編集・削除、プレビュー表示(marked + DOMPurify)
- 入力停止 **800ms** 後に SQLite へ自動保存(保存状態インジケーター付き)

### ② リアルタイム・レコメンドサイドバー
- **デバウンス**: 入力停止 **600ms** 後にバックグラウンド(メインプロセス)で類似検索
- **タブ切替**: 「✨ 意味的類似(ベクトル)」/「🔤 キーワード」の各 Top10
- **グラデーションUI**:
  - 1〜3位 … カード表示(抜粋3行 + 類似度スコアバー + 一致語チップ)
  - 4〜6位 … コンパクト表示(抜粋1行)
  - 7位以下 … スリム表示(タイトルのみ)+ 順位に応じて透明度を下げる
- **マイクロインタラクション**:
  - ホバーで `scale(1.03)` の滑らかな拡大(サイドバーのパディング内に収まり枠を越境しない)
  - スリム表示アイテムはホバー時に抜粋がスライド展開

## ステップ2への拡張ポイント

- `electron/search.js` の `vectorSearch()` をローカル埋め込みモデルに差し替え
  (埋め込みは保存時に計算して DB にキャッシュする設計を推奨)
- メモ間リンク(`[[リンク]]` 記法)とグラフビュー
- タグ・全文検索 UI・エクスポート機能
