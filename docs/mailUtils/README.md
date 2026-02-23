# Mail Utils ドキュメント

対象ディレクトリ: `server/utils`

このドキュメントは、サーバーサイドのメール機能別ユーティリティの全体像を整理しています。
各ユーティリティはメール容量管理・IMAP/SMTP 通信・暗号化・サニタイズ・DB キャッシュを提供。

---

## mail-account.ts

### 役割

ユーザーメールアカウント情報（IMAP/SMTP 接続設定）を DB から取得・管理。暗号化パスワード復号化も実施。

### 定数、変数

なし

### 型

- `MailAccount`: ユーザーメールアカウント型

### 関数名

- `getMailAccount(userId: string): Promise<MailAccount | null>`
  - 役割: ユーザー ID からメールアカウント情報を DB 取得。パスワードは暗号化済みなので復号化して返却。
  - サンプルコード:
    ```ts
    const account = await getMailAccount('user-123');
    // { id, userId, host, port, emailAddress, encryptedPassword, ... }
    ```

- `saveMailAccount(userId: string, account: Partial<MailAccount>): Promise<void>`
  - 役割: メールアカウント情報を DB に保存。パスワードは自動暗号化。
  - サンプルコード:
    ```ts
    await saveMailAccount('user-123', {
      host: 'mail.example.com',
      port: 993,
      emailAddress: 'user@example.com',
      password: 'plaintext-password',
    });
    // DB に暗号化パスワードとともに保存
    ```

---

## mail-crypto.ts

### 役割

メールパスワード暗号化・復号化。対称暗号（AES-256）実装。

### 定数、変数

- `ENCRYPTION_KEY`: 暗号化（環境変数から取得）

### 型

なし

### 関数名

- `encryptPassword(plaintext: string): string`
  - 役割: パスワードを AES-256 で暗号化。
  - サンプルコード:
    ```ts
    const encrypted = encryptPassword('my-password');
    // "xxx:yyy:zzz" (IV:salt:cipher の形式)
    ```

- `decryptPassword(encrypted: string): string`
  - 役割: 暗号化パスワードを復号化。
  - サンプルコード:
    ```ts
    const original = decryptPassword(encrypted);
    // "my-password"
    ```

---

## mail-cache.ts

### 役割

メールメタデータ（UID・件名・日付）をキャッシュに保存。パフォーマンス向上用。

### 定数、変数

- `CACHE_TTL`: キャッシュ有効期限（デフォルト 1 時間）

### 型

- `MailCacheEntry`: キャッシュエントリ型

### 関数名

- `getCacheKey(userId: string, folder: string): string`
  - 役割: ユーザー ID とフォルダ名からキャッシュキーを生成。
  - サンプルコード:
    ```ts
    const key = getCacheKey('user-123', 'INBOX');
    // "mail:user-123:INBOX"
    ```

- `getMailCache(userId: string, folder: string): Promise<MailCacheEntry[] | null>`
  - 役割: キャッシュからメールメタデータ一覧を取得。キャッシュ期限切れなら null。
  - サンプルコード:
    ```ts
    const cached = await getMailCache('user-123', 'INBOX');
    // [{ uid: 1, subject: '...', date: '...' }, ...] または null
    ```

- `setMailCache(userId: string, folder: string, messages: MailListItem[]): Promise<void>`
  - 役割: メールメタデータをキャッシュに保存（TTL 付き）。
  - サンプルコード:
    ```ts
    await setMailCache('user-123', 'INBOX', messages);
    // キャッシュに保存、TTL 1 時間で自動削除
    ```

---

## imap.ts

### 役割

IMAP クライアント統合。接続・切断・フォルダ取得・メール読み込み・IDLE 起動を統一インターフェースで提供。

### 定数、変数

なし

### 型

- `ImapConnection`: IMAP 接続オブジェクト型
- `MailboxInfo`: メールボックス情報型

### 関数名

- `connectToImap(account: MailAccount): Promise<ImapConnection>`
  - 役割: メールアカウント設定で IMAP サーバーへ接続。
  - サンプルコード:
    ```ts
    const conn = await connectToImap(account);
    // 接続成功
    ```

- `listMailboxes(conn: ImapConnection): Promise<MailboxInfo[]>`
  - 役割: 接続済み IMAP からメールボックス一覧を取得。
  - サンプルコード:
    ```ts
    const boxes = await listMailboxes(conn);
    // [{ path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' }, ...]
    ```

- `getMessages(conn: ImapConnection, folder: string, limit: number): Promise<MailListItem[]>`
  - 役割: 指定フォルダから最新 N 件のメールメタデータを取得。
  - サンプルコード:
    ```ts
    const messages = await getMessages(conn, 'INBOX', 50);
    // [{ uid: 1, subject: '...', from: '...', date: '...', seen: false }, ...]
    ```

- `getMessage(conn: ImapConnection, folder: string, uid: number): Promise<MailDetail>`
  - 役割: 指定 UID のメール全文・HTML・添付ファイル一覧を取得。MIME 解析実施。
  - サンプルコード:
    ```ts
    const detail = await getMessage(conn, 'INBOX', 123);
    // { uid: 123, text: '...', html: '<p>...</p>', attachments: [...] }
    ```

- `startIdle(conn: ImapConnection, folder: string, onNewMail: () => void): Promise<void>`
  - 役割: IMAP IDLE モード起動。新着メール検知時 onNewMail コールバック実行。
  - サンプルコード:
    ```ts
    await startIdle(conn, 'INBOX', () => {
      console.log('新着メール!');
    });
    ```

- `setFlags(conn: ImapConnection, folder: string, uid: number, flags: string[]): Promise<void>`
  - 役割: UID にフラグを設定（\Seen, \Deleted など）。
  - サンプルコード:
    ```ts
    await setFlags(conn, 'INBOX', 123, ['\\Seen']);
    // UID 123 に既読フラグ設定
    ```

- `copy(conn: ImapConnection, folder: string, uid: number, dest: string): Promise<void>`
  - 役割: UID をコピー（別フォルダへ）。
  - サンプルコード:
    ```ts
    await copy(conn, 'INBOX', 123, 'Archive');
    // UID 123 を Archive へコピー
    ```

- `createMailbox(conn: ImapConnection, name: string): Promise<void>`
  - 役割: 新規メールボックス作成。
  - サンプルコード:
    ```ts
    await createMailbox(conn, 'MyFolder');
    ```

- `renameMailbox(conn: ImapConnection, oldPath: string, newPath: string): Promise<void>`
  - 役割: メールボックス改名。
  - サンプルコード:
    ```ts
    await renameMailbox(conn, 'OldFolder', 'NewFolder');
    ```

- `deleteMailbox(conn: ImapConnection, path: string): Promise<void>`
  - 役割: メールボックス削除。
  - サンプルコード:
    ```ts
    await deleteMailbox(conn, 'OldFolder');
    ```

- `closeImap(conn: ImapConnection): Promise<void>`
  - 役割: IMAP 接続切断。リソース解放。
  - サンプルコード:
    ```ts
    await closeImap(conn);
    ```

---

## mail-sanitize.ts

### 役割

メール HTML コンテンツをサニタイズ。XSS / インジェクション 対策。

### 定数、変数

- `ALLOWED_TAGS`: ホワイトリスト HTML タグ（a, p, div など）
- `ALLOWED_ATTRIBUTES`: ホワイトリスト 属性（href, target など）

### 型

なし

### 関数名

- `sanitizeHtml(html: string): string`
  - 役割: HTML をホワイトリスト方式でサニタイズ。危険なスクリプト・style を削除。
  - サンプルコード:
    ```ts
    const safe = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    // "<p>Hello</p>" (script は削除)
    ```

- `sanitizeText(text: string): string`
  - 役割: テキストをサニタイズ（改行・特殊文字保持）。
  - サンプルコード:
    ```ts
    const safe = sanitizeText('Hello\nWorld');
    // "Hello\nWorld" (安全)
    ```

---

## mail-realtime.ts

### 役割

SSE（Server-Sent Events）による新着メール検知ストリーミング。IMAP IDLE を SSE でラップ。

### 定数、変数

なし

### 型

- `EventStream`: SSE ストリームオブジェクト型

### 関数名

- `createMailStream(account: MailAccount, folder: string): EventStream`
  - 役割: メールアカウント・フォルダから SSE ストリームを作成。IMAP IDLE 起動。
  - サンプルコード:
    ```ts
    const stream = createMailStream(account, 'INBOX');
    // stream.push({ event: 'connected' })
    // stream.push({ event: 'new-mail' })
    ```

- `stream.push(event: { event: string, data?: any }): void`
  - 役割: SSE クライアントへイベント送信。
  - サンプルコード:
    ```ts
    stream.push({ event: 'heartbeat' });
    stream.push({ event: 'new-mail', data: { count: 1 } });
    ```

- `stream.close(): void`
  - 役割: ストリーム終了・IMAP 接続切断。
  - サンプルコード:
    ```ts
    stream.close();
    ```

---

## mail-sync.ts

### 役割

複数フォルダ・複数メールの一括同期。ローカルキャッシュとサーバー状態を同期。

### 定数、変数

なし

### 型

なし

### 関数名

- `syncFolder(userId: string, folder: string): Promise<SyncResult>`
  - 役割: 指定フォルダとサーバーの状態を同期。新着・削除・更新を検知。
  - サンプルコード:
    ```ts
    const result = await syncFolder('user-123', 'INBOX');
    // { added: [...], deleted: [...], updated: [...] }
    ```

- `syncAllFolders(userId: string): Promise<SyncResult[]>`
  - 役割: 全フォルダを同期。
  - サンプルコード:
    ```ts
    const results = await syncAllFolders('user-123');
    // 全フォルダの同期結果
    ```

---

## logger.ts

### 役割

メール機能のログ出力。デバッグ・エラー追跡用。

### 定数、変数

なし

### 型

なし

### 関数名

- `logMailDebug(message: string, context?: any): void`
  - 役割: DEBUG レベルログ出力。
  - サンプルコード:
    ```ts
    logMailDebug('IMAP 接続成功', { account: '...' });
    ```

- `logMailError(message: string, error: Error, context?: any): void`
  - 役割: ERROR レベルログ出力。
  - サンプルコード:
    ```ts
    logMailError('IMAP 接続失敗', err, { account: '...' });
    ```

---

## email.ts

### 役割

メール送信用ユーティリティ。SMTP 経由でメール構築・送信。

### 定数、変数

なし

### 型

- `EmailPayload`: メール構築用型（to, cc, bcc, subject, text, html, attachments）

### 関数名

- `buildEmailMessage(payload: EmailPayload): string`
  - 役割: メールペイロードから MIME 形式メッセージを構築。
  - サンプルコード:
    ```ts
    const mime = buildEmailMessage({
      to: 'recipient@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    // "To: recipient@example.com\nSubject: Test\n\nHello"
    ```

- `sendEmailViaSMTP(account: MailAccount, payload: EmailPayload): Promise<SendResult>`
  - 役割: SMTP でメール送信。メッセージ ID を返却。
  - サンプルコード:
    ```ts
    const result = await sendEmailViaSMTP(account, payload);
    // { messageId: '<msg@server>', accepted: ['recipient@example.com'] }
    ```

---
