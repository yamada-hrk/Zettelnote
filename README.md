# ZettelNote

[![Release](https://github.com/yamada-hrk/Zettelnote/actions/workflows/release.yml/badge.svg)](https://github.com/yamada-hrk/Zettelnote/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/yamada-hrk/Zettelnote)](https://github.com/yamada-hrk/Zettelnote/releases)

ネットワーク接続を一切必要とせず、完全ローカル環境で動作するツェッテルカステン(Zettelkasten)方式のメモアプリです。
編集中のテキストに対して、過去のメモを意味的類似度・キーワード・ハッシュタグの観点からリアルタイムでレコメンドし、
知識の繋がりを可視化します。任意でサーバー同期(ゼロ知識暗号化)も利用できます。

## 目次

- [ダウンロード](#ダウンロード)
- [主な機能](#主な機能)
- [技術スタックと選定理由](#技術スタックと選定理由)
- [ディレクトリ構成](#ディレクトリ構成)
- [セットアップと起動](#セットアップと起動)
- [コード署名(SignPath)](#コード署名signpath)
- [コントリビューション](#コントリビューション)
- [プライバシー](#プライバシー)
- [ライセンス](#ライセンス)

## ダウンロード

Windows 版インストーラーは [Releases](https://github.com/yamada-hrk/Zettelnote/releases) から
最新版の `ZettelNote-Setup-x.y.z.exe` をダウンロードしてください。`v*.*.*` タグの push ごとに
GitHub Actions が自動ビルド・公開します(詳細は [コード署名](#コード署名signpath) 参照)。

## 主な機能

- **ローカルファースト**: インストール直後からログイン不要で全機能が使える。データは端末の SQLite に保存
- **Markdown エディタ**: 編集 / プレビュー切替、フローティングツールバー、閲覧履歴の戻る・進む
- **リアルタイム・レコメンド**: 意味的類似(文字バイグラム TF-IDF)とキーワード一致を常時提示
- **ハイブリッド検索**: 左ペインのキーワード絞り込み + 右ペインの AI 連想検索を同時表示(`Ctrl+K`)
- **ハッシュタグ**: `#タグ名` の自動認識、タグパネルでの一覧・絞り込み、関連メモでの繋がり可視化
- **サイドバーのリサイズ・開閉**: ドラッグでの幅調整、`Ctrl+B` / `Ctrl+Shift+B` での開閉、レイアウト永続化
- **クラウド同期(オプトイン)**: アカウント制ログイン + クライアントサイド暗号化(サーバーは暗号鍵を持たないゼロ知識設計)。既定はオフで、設定するまでは一切サーバー通信を行わない

## 技術スタックと選定理由

| 項目 | 採用技術 | 選定理由 |
|---|---|---|
| フレームワーク | **Electron 43** | 開発マシンに Rust ツールチェーンが未導入のため、Node.js のみで即座に構築できる Electron を採用。IPC 境界(preload API)を薄く保ってあるため、将来 Tauri へ移行する場合もフロントエンドはそのまま流用可能 |
| フロントエンド | React 19 / TypeScript / Tailwind CSS v4 | 仕様指定どおり。Tailwind v4 は設定ファイル不要で Vite プラグインのみで動作 |
| ビルド | Vite 8 | 高速な HMR。`base: './'` 設定で Electron の `file://` 読み込みにも対応 |
| DB | SQLite (**better-sqlite3**) | 同期 API で高速・堅牢。Electron 用プリビルドバイナリで動作確認済み(ネイティブビルド不要) |
| 検索 | 文字バイグラム TF-IDF + コサイン類似度(自前実装) | 「ネットワーク接続を一切必要としない」要件を厳守するため、モデルダウンロードが必要な埋め込みモデルは見送り。日本語を分かち書きなしで扱える文字バイグラム方式を採用。`electron/search.js` の `vectorSearch()` を差し替えるだけでローカル埋め込みモデル(例: multilingual-e5-small + ONNX Runtime)へ移行できる構造 |
| 同期サーバー | Node.js / Express + PostgreSQL 16 | Docker Compose で一発起動。暗号化済みデータのみを保存するゼロ知識ストア |
| パッケージング | electron-builder | Windows 向け NSIS インストーラーを生成。GitHub Actions で自動ビルド |
| Web版 | Vite + React + TypeScript(別アプリ、`web/`) | 常にサーバーへログインするシンクライアント。`electron/search.js`・`tags.js` をデスクトップ版と直接共有(コピーではない) |

## ディレクトリ構成

```
Zettelkasten/
├── electron/               # メインプロセス(CommonJS・ビルド不要)
│   ├── main.js             # ウィンドウ生成・IPC ハンドラ登録
│   ├── preload.js          # contextBridge で window.api を安全に公開
│   ├── db.js               # SQLite データアクセス層(CRUD・同期用マイグレーション)
│   ├── search.js           # ベクトル検索・キーワード検索・検索バー用フィルタ(完全ローカル)
│   ├── tags.js              # ハッシュタグ抽出(#タグ名 の認識・正規化)
│   ├── crypto.js            # クライアントサイド暗号化(scrypt + AES-256-GCM)
│   └── sync.js               # サーバー同期エンジン(LWW 差分同期)
├── server/                  # 同期バックエンド(Express + PostgreSQL、Docker Compose で起動)
│                            #   起動時に web/dist が存在すれば静的配信も兼ねる
├── web/                     # Web版(デスクトップ版とは別の Vite+React アプリ)
│   ├── src/lib/
│   │   ├── search.ts        # electron/search.js・tags.js を直接 import して共有
│   │   ├── webCrypto.ts     # Web Crypto 版暗号化(Node版とバイト互換)
│   │   ├── apiClient.ts     # 同期サーバー API クライアント(fetch)
│   │   └── notesStore.ts    # メモの取得・保存(サーバーが唯一の正)
│   ├── src/screens/         # LoginScreen(登録/ログイン)・UnlockScreen(暗号化キー入力)
│   └── scripts/             # デスクトップ版との暗号互換性・E2E動作の検証スクリプト
├── src/                     # レンダラー(React / TypeScript)
│   ├── main.tsx             # エントリポイント
│   ├── App.tsx              # 3カラムレイアウト・状態管理・自動保存・検索制御
│   ├── components/
│   │   ├── NoteList.tsx     # 左: 検索バー・メモ一覧・タグパネル・同期パネル
│   │   ├── Editor.tsx       # 中央: Markdown エディタ + プレビュー + フローティングツールバー
│   │   ├── PanelHandle.tsx  # サイドバー境界線(ドラッグリサイズ + 開閉トグル)
│   │   ├── RecommendSidebar.tsx # 右: レコメンド / AI 連想検索(タブ・グラデーションUI)
│   │   ├── SyncPanel.tsx    # クラウド同期の設定・ステータス表示
│   │   └── ConfirmDialog.tsx # アプリ内確認モーダル
│   ├── hooks/
│   │   ├── useDebounce.ts        # デバウンス処理
│   │   ├── useNoteHistory.ts     # 閲覧履歴スタック(戻る / 進む)
│   │   └── useResizablePanel.ts  # サイドバーの幅・開閉状態(localStorage 永続化)
│   ├── types.ts             # 共有型定義
│   ├── global.d.ts          # window.api の型定義
│   └── index.css            # Tailwind + Markdown プレビュー用スタイル
├── docker-compose.yml        # 同期バックエンドの起動設定
├── electron-builder.yml      # デスクトップアプリのパッケージング設定
├── .github/workflows/         # CI/CD(リリース自動化)
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

# Windows インストーラーを生成(release/ に出力。dev サーバー停止中に実行)
npm run dist
```

DB ファイルは `%APPDATA%\zettelkasten-local\zettelkasten.db` に保存されます
(パッケージ版は `%APPDATA%\ZettelNote\` )。

### リリース(GitHub Actions)

`v*.*.*` 形式のタグを push すると、GitHub Actions が Windows インストーラーをビルドして
GitHub Releases に自動添付します(`.github/workflows/release.yml`)。SignPath 未設定でも
未署名ビルドとして問題なく動作します。

```powershell
git tag -a v0.3.0 -m "リリース内容"
git push origin v0.3.0
```

### Step2: 同期バックエンドの起動(任意)

```powershell
# API サーバー + PostgreSQL を起動(初回はビルドあり)
docker compose up -d --build

# 停止(サーバー側データは volume に保持)
docker compose down
```

アプリは**ログインなしのローカルモードが既定**で、同期は完全オプトインです。
同期したい場合はアプリ左下の「⚙」から「新規登録」タブでアカウントを作成し、
サーバー URL(`http://localhost:8787`)・アカウント名・パスワード・暗号化キーを設定してください。
メモは**端末側で暗号化してから**送信され、サーバーには暗号文のみが保存されます。
暗号化キーはサーバーに送信されず、パスワード(認証用)とも独立しています(詳細は仕様書 §5.8)。

### Web版

`docker compose up -d --build` を実行すると、API サーバーに加えて Web版アプリもビルドされ、
同じコンテナから配信されます。ブラウザで `http://localhost:8787/` を開くだけで使えます。

```powershell
# Web版だけを開発モードで起動する場合(要: 別途 API サーバーが起動していること)
cd web
npm install
npm run dev   # http://localhost:5174 (API へは /api 経由でプロキシ)
```

**デスクトップ版との違い**: Web版は**常にサーバーへのログインが必須**です(ローカルのみモードはありません)。
また暗号化キーはブラウザに保存されないため、**開くたびに再入力**が必要です(デスクトップ版は Electron の
`safeStorage` で安全に保存・自動復元しますが、ブラウザには同等の仕組みが無いための意図的な設計です)。

**共有ソース**: `electron/search.js`・`tags.js`(検索・ハッシュタグ抽出ロジック)は Web版から
直接 import しており、コピーではなく完全に同じファイルを使っています。暗号化(scrypt + AES-256-GCM)は
Node の `crypto` と ブラウザの Web Crypto API でそれぞれ実装していますが、**同じアカウントのメモを
デスクトップ版・Web版のどちらからでも復号できるようバイト互換性を検証済み**です
(`web/scripts/verify-crypto-compat.mjs`)。

## コード署名(SignPath)

Windows 版インストーラーは、オープンソースプロジェクト向けの無償コード署名サービス
**[SignPath.io](https://signpath.io)**(証明書提供: SignPath Foundation)への対応を準備しています。

> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org/)

- **現状**: SignPath への申請待ち・審査待ちの段階です。承認後、GitHub Actions のリリースワークフローに
  署名ステップが自動的に有効化されます(`vars.SIGNPATH_ENABLED` を `true` に切り替えるだけで、
  ワークフロー自体の変更は不要な設計にしてあります)
- **署名なしの現在**: ダウンロードしたインストーラー実行時に Windows SmartScreen の警告が表示されます。
  発行元を確認のうえ「詳細情報」→「実行」で続行してください
- 導入の技術的な詳細は `.github/workflows/release.yml` のコメントを参照

## コントリビューション

バグ報告・機能提案・プルリクエストを歓迎します。開発環境のセットアップ手順や PR の出し方は
[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## プライバシー

ZettelNote は既定でローカルのみで動作し、テレメトリの類は一切送信しません。クラウド同期を有効にした場合の
データの扱いも含め、詳細は [PRIVACY.md](./PRIVACY.md) を参照してください。

## ライセンス

[MIT License](./LICENSE) の下で公開しています。
