# Mail API ドキュメント

対象ディレクトリ: `server/api/pitamai/mail`

このドキュメントは、Nuxt Nitro API エンドポイント（メール機能提供用）の全体像を整理しています。
各エンドポイントはメル クライアント動作に必要なメール取得・送受信・フォルダ管理を実装します。

---

## accounts.get.ts

### 役割

ログイン中のユーザーのメールアカウント一覧を返却します。アカウントが複数登録されている場合は全て列挙。

### 定数、変数

なし

### 型

- 返却型: `{ accounts: MailAccountItem[] }`
  - MailAccountItem: `{ id, label, emailAddress }`

### 関数名

- `defineEventHandler()`
  - 役割: HTTP GET リクエストを処理。ユーザー認証を確認してから DB へアカウント照会。
  - サンプルコード:

    ```ts
    // リクエスト
    GET / api / pitamai / mail / accounts;

    // レスポンス
    {
      accounts: [{ id: 'acc1', emailAddress: 'user@example.com' }];
    }
    ```

---

## imap-test.get.ts

### 役割

IMAP に接続してメールボックス一覧を取得。アカウント登録後の接続テストに使用。

### 定数、変数

なし

### 型

- 返却型: `{ mailboxes: MailboxItem[] }`
  - MailboxItem: `{ path, name, specialUse }`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP 接続を確立し、ボックス一覧を列挙。
  - サンプルコード:

    ```ts
    // リクエスト
    GET / api / pitamai / mail / imap - test;

    // レスポンス
    {
      mailboxes: [{ path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' }];
    }
    ```

---

## messages.get.ts

### 役割

指定フォルダのメール一覧メタデータを取得。UID・件名・送信者・日付・未読状態・添付有無を返却。

### 定数、変数

なし

### 型

- クエリ パラメータ: `folder` (string), `limit` (number), `forceSync` (boolean)
- 返却型: `{ messages: MailListItem[] }`
  - MailListItem: `{ uid, subject, from, date, hasAttachment, seen }`

### 関数名

- `defineEventHandler()`
  - 役割: フォルダ内のメール一覧を取得。forceSync=true ならキャッシュ無視して常にサーバー同期。
  - サンプルコード:

    ```ts
    // リクエスト
    GET /api/pitamai/mail/messages?folder=INBOX&limit=50&forceSync=false

    // レスポンス
    { messages: [{ uid: 1, subject: 'Hello', from: 'sender@example.com', ... }] }
    ```

---

## message.get.ts

### 役割

指定 UID のメール全文・HTML・添付ファイル一覧を取得。詳細表示用。

### 定数、変数

なし

### 型

- クエリ パラメータ: `folder` (string), `uid` (number)
- 返却型: `{ message: MailDetail }`
  - MailDetail: `{ uid, subject, from, to, cc, bcc, date, text, html, attachments }`

### 関数名

- `defineEventHandler()`
  - 役割: メールボディを MIME 解析し、テキスト・HTML・添付ファイルを別キーで返却。
  - サンプルコード:

    ```ts
    // リクエスト
    GET /api/pitamai/mail/message?folder=INBOX&uid=123

    // レスポンス
    { message: { uid: 123, text: '本文...', html: '<p>本文...</p>', attachments: [] } }
    ```

---

## send.post.ts

### 役割

メール送信。SMTP 経由で指定宛先へメールを送信。成功時は送信済みフォルダへも自動保存試行。

### 定数、変数

なし

### 型

- リクエストボディ: `{ to?, cc?, bcc?, subject, text, attachments[] }`
- 返却型: `{ ok: true, messageId, accepted, sentStored, sentMailbox }`

### 関数名

- `defineEventHandler()`
  - 役割: SMTP に接続、メール送信。メッセージ ID を取得し、送信済みフォルダへの自動保存を試行。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/send
    { "to": "recipient@example.com", "subject": "Test", "text": "Hello" }

    // レスポンス
    { ok: true, messageId: '<msg@server>', accepted: ['recipient@example.com'], sentStored: true }
    ```

---

## draft.post.ts

### 役割

下書きメール保存。SMTP APPEND コマンドで下書きフォルダへ直接保存。

### 定数、変数

なし

### 型

- リクエストボディ: `{ to?, cc?, bcc?, subject, text, attachments[] }`
- 返却型: `{ ok: true, stored, mailbox }`

### 関数名

- `defineEventHandler()`
  - 役割: 下書きをメールボディ形式で構築し、SMTP/IMAP 経由で下書きフォルダへ保存。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/draft
    { "to": "recipient@example.com", "subject": "Draft", "text": "下書き..." }

    // レスポンス
    { ok: true, stored: true, mailbox: 'Drafts' }
    ```

---

## seen.post.ts

### 役割

UID のメールの既読 / 未読状態を更新。IMAP FLAG を変更。

### 定数、変数

なし

### 型

- リクエストボディ: `{ folder, uid, seen: boolean }`
- 返却型: `{}`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP に接続、指定 UID のメールに `\Seen` フラグを設定 / 解除。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/seen
    { "folder": "INBOX", "uid": 123, "seen": true }

    // レスポンス
    {}
    ```

---

## move.post.ts

### 役割

メールを特定フォルダへ移動（trash / archive / inbox）。

### 定数、変数

なし

### 型

- リクエストボディ: `{ folder, uid, destination: 'trash' | 'archive' | 'inbox' }`
- 返却型: `{}`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP COPY で指定先フォルダへコピー、元UID に `\Deleted` フラグ設定。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/move
    { "folder": "INBOX", "uid": 123, "destination": "trash" }

    // レスポンス
    {}
    ```

---

## move-to-folder.post.ts

### 役割

メールをユーザー指定フォルダへ移動（ドラッグドロップ用）。

### 定数、変数

なし

### 型

- リクエストボディ: `{ uid, fromFolder, toFolder }`
- 返却型: `{}`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP COPY で toFolder へコピー、元フォルダの UID に `\Deleted` 設定。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/move-to-folder
    { "uid": 123, "fromFolder": "INBOX", "toFolder": "Archive" }

    // レスポンス
    {}
    ```

---

## folder-create.post.ts

### 役割

新規フォルダ作成。IMAP CREATE コマンド実行後、フォルダ一覧更新を返却。

### 定数、変数

なし

### 型

- リクエストボディ: `{ name: string }`
- 返却型: `{ mailboxes: MailboxItem[] }`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP に新規フォルダを作成。完了後、全フォルダ一覧を再取得。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/folder-create
    { "name": "MyFolder" }

    // レスポンス
    { mailboxes: [...] }
    ```

---

## folder-rename.post.ts

### 役割

フォルダ改名。IMAP RENAME コマンド実行後、フォルダ一覧更新を返却。

### 定数、変数

なし

### 型

- リクエストボディ: `{ path: string, newName: string }`
- 返却型: `{ mailboxes: MailboxItem[] }`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP でフォルダ改名。完了後、全フォルダ一覧を再取得。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/folder-rename
    { "path": "OldFolder", "newName": "NewFolder" }

    // レスポンス
    { mailboxes: [...] }
    ```

---

## folder-delete.post.ts

### 役割

フォルダ削除。IMAP DELETE コマンド実行後、フォルダ一覧更新を返却。

### 定数、変数

なし

### 型

- リクエストボディ: `{ path: string }`
- 返却型: `{ mailboxes: MailboxItem[] }`

### 関数名

- `defineEventHandler()`
  - 役割: IMAP でフォルダ削除。完了後、全フォルダ一覧を再取得。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/folder-delete
    { "path": "OldFolder" }

    // レスポンス
    { mailboxes: [...] }
    ```

---

## stream.get.ts

### 役割

SSE（Server-Sent Events）による新着メール検知。IMAP IDLE モード で新着を待機。

### 定数、変数

なし

### 型

- クエリ パラメータ: `folder` (string)
- イベント型: `{ event: 'connected' | 'ready' | 'heartbeat' | 'new-mail' | 'error' }`

### 関数名

- `defineEventHandler()`
  - 役割: SSE ハンドシェイク → IMAP IDLE 開始 → 新着検知 → クライアントへ イベント送信。
  - サンプルコード:

    ```ts
    // リクエスト
    GET /api/pitamai/mail/stream?folder=INBOX

    // イベントストリーム例
    event: connected

    event: heartbeat

    event: new-mail
    data: {}
    ```

---

## settings.get.ts

### 役割

メール設定情報の取得（パスワード設定状態など）。

### 定数、変数

なし

### 型

- 返却型: 設定情報オブジェクト

### 関数名

- `defineEventHandler()`
  - 役割: DB からユーザーメール設定を取得・返却。
  - サンプルコード:

    ```ts
    // リクエスト
    GET /api/pitamai/mail/settings

    // レスポンス
    { host: 'mail.example.com', port: 993, ... }
    ```

---

## settings.post.ts

### 役割

メール設定を更新・保存。パスワードは暗号化して DB に保存。

### 定数、変数

なし

### 型

- リクエストボディ: メール設定オブジェクト（host, port, password など）
- 返却型: `{ ok: true }`

### 関数名

- `defineEventHandler()`
  - 役割: リクエストボディの設定を検証、パスワード暗号化、DB に保存。
  - サンプルコード:

    ```ts
    // リクエスト
    POST /api/pitamai/mail/settings
    { "host": "mail.example.com", "port": 993, "password": "secret" }

    // レスポンス
    { ok: true }
    ```

---

## smtp-test.get.ts

### 役割

SMTP 接続テスト。設定値で SMTP に接続可能かを確認。

### 定数、変数

なし

### 型

- 返却型: `{ ok: boolean }`

### 関数名

- `defineEventHandler()`
  - 役割: 現在の設定で SMTP 接続試行。成功なら `{ ok: true }`、失敗なら エラー返却。
  - サンプルコード:

    ```ts
    // リクエスト
    GET / api / pitamai / mail / smtp - test;

    // レスポンス
    {
      ok: true;
    }
    ```

---
