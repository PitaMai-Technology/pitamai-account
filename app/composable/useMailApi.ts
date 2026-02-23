// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メール API クライアント統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 役割:
// サーバー側の Nitro API エンドポイント（server/api/pitamai/mail/**）と通信するための
// フロントエンド側クライアント。$fetch による型安全な API 呼び出しを提供します。
// 各 composable (useMailMessages, useMailFolders, useMailCompose) から依存注入される形で利用。

// ───────────────────────────────────────────────────────────────────────
// 型定義
// ───────────────────────────────────────────────────────────────────────

// ユーザーのメールアカウント情報（複数登録対応）
// - id: アカウント DB 識別子
// - label: ユーザーが自由につけたラベル（optional）
// - emailAddress: IMAP/SMTP に登録されたメールアドレス
type MailAccountItem = {
  id: string;
  label: string | null;
  emailAddress: string;
};

// IMAP メールボックス情報
// - path: IMAP フォルダパス（例: "INBOX", "[Gmail]/All Mail"）
// - name: フォルダ表示名
// - specialUse: IMAP RFC 6154 特別用途フラグ（例: "\\Inbox", "\\Drafts", "\\Sent"）
//   サーバー実装差分でパス名が揺れても specialUse で信頼できる判定が可能
type MailboxItem = {
  path: string;
  name: string;
  specialUse: string | null;
};

// メール一覧のメタデータ（詳細表示なし、一覧表示用の軽量情報）
// - uid: IMAP UID（フォルダ内で一意）
// - subject: 件名
// - from: 送信者アドレス（ヘッダ値そのまま）
// - date: 送信日時
// - hasAttachment: 添付ファイルの有無フラグ（UI アイコン表示用）
// - seen: 既読状態（\Seen フラグ）
type MailListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  hasAttachment: boolean;
  seen: boolean;
};

// メール詳細情報（詳細表示パネル用・MIME 解析済み）
// - uid, subject, from, date: MailListItem と同じ
// - to, cc, bcc: メールヘッダから読み込んだ宛先（下書き復元に使用）
// - text: プレーンテキスト本文（text/plain パート）
// - html: HTML 本文（text/html パート・クライアントでサニタイズ必須）
// - attachments: 添付ファイル一覧（filename, MIME type, サイズ）
type MailDetail = {
  uid: number;
  subject: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  date: string | null;
  text: string | null;
  html: string | null;
  isGpgSigned: boolean;
  pgpDetachedSignature: string | null;
  pgpDetachedSignedDataBase64: string | null;
  pgpEncryptedMessage: string | null;
  attachments: Array<{
    filename: string | null;
    contentType: string;
    size: number;
    contentDisposition: string;
  }>;
};

// 送信・下書き保存用の添付ファイル形式
// - filename: ユーザーが選択したファイル名
// - contentType: MIME type（application/pdf など）
// - contentBase64: ファイルを Base64 エンコードした文字列（ネットワーク送信可能な形式）
type SendAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export function useMailApi() {
  const getAccounts = () =>
    $fetch<{ accounts: MailAccountItem[] }>('/api/pitamai/mail/accounts');

  const getMailboxes = () =>
    $fetch<{ mailboxes: MailboxItem[] }>('/api/pitamai/mail/imap-test');

  const createFolder = (name: string) =>
    $fetch<{ mailboxes: MailboxItem[] }>('/api/pitamai/mail/folder-create', {
      method: 'POST',
      body: { name },
    });

  const renameFolder = (path: string, newName: string) =>
    $fetch<{ mailboxes: MailboxItem[] }>('/api/pitamai/mail/folder-rename', {
      method: 'POST',
      body: { path, newName },
    });

  const deleteFolder = (path: string) =>
    $fetch<{ mailboxes: MailboxItem[] }>('/api/pitamai/mail/folder-delete', {
      method: 'POST',
      body: { path },
    });

  const moveToFolder = (uid: number, fromFolder: string, toFolder: string) =>
    $fetch('/api/pitamai/mail/move-to-folder', {
      method: 'POST',
      body: { uid, fromFolder, toFolder },
    });

  const getMessages = (params: {
    folder: string;
    limit: number;
    forceSync: boolean;
    signal?: AbortSignal;
  }) =>
    $fetch<{ messages: MailListItem[] }>('/api/pitamai/mail/messages', {
      query: {
        folder: params.folder,
        limit: params.limit,
        forceSync: params.forceSync,
      },
      signal: params.signal,
    });

  const getMessage = (params: {
    folder: string;
    uid: number;
    signal?: AbortSignal;
  }) =>
    $fetch<{ message: MailDetail }>('/api/pitamai/mail/message', {
      query: {
        folder: params.folder,
        uid: params.uid,
      },
      signal: params.signal,
    });

  const updateSeen = (folder: string, uid: number, seen: boolean) =>
    $fetch('/api/pitamai/mail/seen', {
      method: 'POST',
      body: { folder, uid, seen },
    });

  const moveMessage = (
    folder: string,
    uid: number,
    destination: 'trash' | 'archive' | 'inbox'
  ) =>
    $fetch('/api/pitamai/mail/move', {
      method: 'POST',
      body: { folder, uid, destination },
    });

  const sendMail = (payload: {
    to?: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    sign?: boolean;
    encrypt?: boolean;
    attachments: SendAttachment[];
  }) =>
    $fetch<{
      ok: true;
      messageId: string;
      accepted: string[];
      sentStored: boolean;
      sentMailbox: string | null;
      isSigned: boolean;
      isEncrypted: boolean;
    }>('/api/pitamai/mail/send', {
      method: 'POST',
      body: payload,
    });

  const saveDraft = (payload: {
    to?: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    attachments: SendAttachment[];
  }) =>
    $fetch<{
      ok: true;
      stored: boolean;
      mailbox: string | null;
    }>('/api/pitamai/mail/draft', {
      method: 'POST',
      body: payload,
    });

  const testImapConnection = () => $fetch('/api/pitamai/mail/imap-test');

  const testSmtpConnection = () => $fetch('/api/pitamai/mail/smtp-test');

  const createStreamUrl = (folder: string) =>
    `/api/pitamai/mail/stream?folder=${encodeURIComponent(folder)}`;

  return {
    getAccounts,
    getMailboxes,
    createFolder,
    renameFolder,
    deleteFolder,
    moveToFolder,
    getMessages,
    getMessage,
    updateSeen,
    moveMessage,
    sendMail,
    saveDraft,
    testImapConnection,
    testSmtpConnection,
    createStreamUrl,
  };
}
