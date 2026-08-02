# プライバシーポリシー / Privacy Policy

**Summary (English)**: ZettelNote is a local-first note-taking app. By default it
runs fully offline and sends no data anywhere. Cloud sync is optional (opt-in);
when enabled, notes are encrypted on the user's device (AES-256-GCM, key derived
from a user-chosen passphrase via scrypt) before being sent to a sync server —
the project does not operate a shared server, users self-host their own via the
included Docker Compose configuration, so that server's operator (typically the
user themselves) is the data controller for that instance. The application
contains no analytics, telemetry, ads, or third-party trackers.

最終更新日: 2026-08-02

## 1. 基本方針

ZettelNote は**ローカルファースト**なメモアプリです。既定の状態では完全にオフラインで動作し、
利用状況の収集(アナリティクス・テレメトリ・クラッシュレポート・広告トラッカーの類)は一切行いません。
外部への通信は、ユーザーが明示的に「クラウド同期」を有効にした場合にのみ発生します。

## 2. ローカルモード(既定)で扱われるデータ

- メモの内容(タイトル・本文・作成日時・更新日時)は、お使いの端末上の SQLite データベースにのみ保存されます
  (`%APPDATA%\zettelkasten-local\zettelkasten.db`、インストール版は `%APPDATA%\ZettelNote\`)
- これらのデータが ZettelNote の開発者やその他の第三者に送信されることはありません

## 3. クラウド同期(オプトイン機能)を有効にした場合

- **同期サーバーは本プロジェクトが運営するものではありません**。`docker-compose.yml` を用いて
  ユーザー自身(または信頼できる第三者)がセルフホストする前提で設計されています。
  そのため、同期サーバーを実際に運用する人が、そのインスタンスにおけるデータの管理者(データコントローラー)となります
- 同期を有効にする際に送信される情報:
  - アカウント名・パスワード(サーバー側では scrypt によるハッシュ値のみを保存し、平文パスワードは保持しません)
  - メモ本文は**端末側で暗号化してから**送信されます(AES-256-GCM。暗号化キーはユーザーが設定したパスフレーズから
    scrypt で導出され、サーバーには一切送信されません)。サーバーが保持するのは暗号文と関連メタデータ(更新日時等)のみです
  - サーバーへの通信であるため、通信元 IP アドレス等は一般的な Web サーバーと同様にサーバー側のログに記録され得ます
    (これはサーバー運用者の設定に依存します)
- 詳細な技術仕様(暗号化方式・同期プロトコル)は README の「Step2: 同期バックエンドの起動」を参照してください

## 4. 第三者への提供

本プロジェクト自身がユーザーデータを収集・保持する仕組みを持たないため、第三者への提供は発生しません。
セルフホストされた同期サーバーにおけるデータの取り扱いは、そのサーバーの運用者の方針に従います。

## 5. お問い合わせ

本ポリシーや ZettelNote のデータの取り扱いについてご質問がある場合は、
[GitHub Issues](https://github.com/yamada-hrk/Zettelnote/issues) からご連絡ください。

## 6. 改定

本ポリシーは今後の機能追加(例: クラウド機能の拡張)に応じて更新される場合があります。
重要な変更がある場合は、本ファイルの「最終更新日」を更新します。
