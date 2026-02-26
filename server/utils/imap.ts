import { createError } from 'h3';
import { ImapFlow } from 'imapflow';
import type { MailAccount } from '@prisma/client';
import { simpleParser } from 'mailparser';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
import { logger } from '~~/server/utils/logger';

/**
 * IMAP / メール処理ユーティリティ
 *
 * このファイルは IMAP サーバーとのやり取り（ImapFlow）をラップし、
 * メッセージ一覧取得、メッセージ詳細取得、添付取得、フラグ更新、フォルダ操作など
 * メールクライアントが必要とする低レベル処理を提供します。
 *
 * また PGP/MIME（multipart/signed / multipart/encrypted）の解析や、
 * Message-Id / In-Reply-To / References などスレッド化に必要なヘッダ抽出機能も含みます。
 */

type MailAccountConnection = Pick<
  MailAccount,
  | 'id'
  | 'imapHost'
  | 'imapPort'
  | 'imapSecure'
  | 'username'
  | 'encryptedPassword'
  | 'encryptionIv'
  | 'encryptionAuthTag'
>;

type MessageListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  hasAttachment: boolean;
  seen: boolean;
};

type MessageFlagItem = {
  uid: number;
  seen: boolean;
};

type MessageAttachment = {
  filename: string | null;
  contentType: string;
  size: number;
  contentDisposition: string;
};

type MessageDetail = {
  uid: number;
  subject: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: MessageAttachment[];
  isGpgSigned: boolean;
  pgpDetachedSignature: string | null;
  pgpDetachedSignedDataBase64: string | null;
  pgpEncryptedMessage: string | null;
};

function extractMultipartSignedParts(source: Buffer): {
  detachedSignature: string | null;
  signedDataBase64: string | null;
} {
  /**
   * extractMultipartSignedParts
   *
   * multipart/signed の生データを解析し、署名本体（detached signature）と
   * 署名対象部分（signed part）を抽出するユーティリティです。
   *
   * 戻り値:
   * - detachedSignature: 署名テキスト（armored）または null
   * - signedDataBase64: 署名対象パートを base64 化した文字列または null
   */
  const sourceText = source.toString('latin1');

  const headerEndCRLF = sourceText.indexOf('\r\n\r\n');
  const headerEndLF = sourceText.indexOf('\n\n');

  const headerEndIndex =
    headerEndCRLF >= 0 ? headerEndCRLF : headerEndLF >= 0 ? headerEndLF : -1;
  const headerSeparatorLength =
    headerEndCRLF >= 0 ? 4 : headerEndLF >= 0 ? 2 : 0;

  if (headerEndIndex < 0) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  const headersText = sourceText.slice(0, headerEndIndex);
  const normalizedHeaders = headersText.replace(/\r?\n[ \t]+/g, ' ');

  const contentTypeMatch = normalizedHeaders.match(
    /content-type:\s*multipart\/signed[^\n]*?/i
  );
  if (!contentTypeMatch) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  const boundaryMatch = normalizedHeaders.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch?.[1]) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  const boundary = boundaryMatch[1];
  const marker = `--${boundary}`;

  const bodyBuffer = source.subarray(headerEndIndex + headerSeparatorLength);
  const bodyText = bodyBuffer.toString('latin1');

  let firstMarker = bodyText.indexOf(marker);
  if (firstMarker < 0) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  let part1Start = firstMarker + marker.length;
  if (bodyText.startsWith('\r\n', part1Start)) {
    part1Start += 2;
  } else if (bodyText.startsWith('\n', part1Start)) {
    part1Start += 1;
  }

  let secondMarker = bodyText.indexOf(`\r\n${marker}`, part1Start);
  let secondMarkerPrefixLength = 2;
  if (secondMarker < 0) {
    secondMarker = bodyText.indexOf(`\n${marker}`, part1Start);
    secondMarkerPrefixLength = 1;
  }

  if (secondMarker < 0) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  const part1End = secondMarker;
  const part1Buffer = bodyBuffer.subarray(part1Start, part1End);

  let part2Start = secondMarker + secondMarkerPrefixLength + marker.length;
  if (bodyText.startsWith('\r\n', part2Start)) {
    part2Start += 2;
  } else if (bodyText.startsWith('\n', part2Start)) {
    part2Start += 1;
  }

  let thirdMarker = bodyText.indexOf(`\r\n${marker}`, part2Start);
  let thirdMarkerPrefixLength = 2;
  if (thirdMarker < 0) {
    thirdMarker = bodyText.indexOf(`\n${marker}`, part2Start);
    thirdMarkerPrefixLength = 1;
  }

  if (thirdMarker < 0) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  const part2End = thirdMarker;
  const part2Buffer = bodyBuffer.subarray(part2Start, part2End);
  const part2Text = part2Buffer.toString('latin1');

  const part2HeaderEndCRLF = part2Text.indexOf('\r\n\r\n');
  const part2HeaderEndLF = part2Text.indexOf('\n\n');

  const part2HeaderEndIndex =
    part2HeaderEndCRLF >= 0
      ? part2HeaderEndCRLF
      : part2HeaderEndLF >= 0
        ? part2HeaderEndLF
        : -1;
  const part2HeaderSeparatorLength =
    part2HeaderEndCRLF >= 0 ? 4 : part2HeaderEndLF >= 0 ? 2 : 0;

  if (part2HeaderEndIndex < 0) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  const signatureBuffer = part2Buffer.subarray(
    part2HeaderEndIndex + part2HeaderSeparatorLength
  );
  const detachedSignature = signatureBuffer.toString('utf8').trim();

  if (!detachedSignature.includes('-----BEGIN PGP SIGNATURE-----')) {
    return { detachedSignature: null, signedDataBase64: null };
  }

  return {
    detachedSignature,
    signedDataBase64: Buffer.from(part1Buffer).toString('base64'),
  };
}

/**
 * multipart/encrypted の生データ（Buffer）を解析し、
 * PGP 暗号化されたメッセージ本文（-----BEGIN PGP MESSAGE-----）を抽出します。
 */
function extractMultipartEncryptedMessage(source: Buffer): string | null {
  const sourceText = source.toString('latin1');

  const headerEndCRLF = sourceText.indexOf('\r\n\r\n');
  const headerEndLF = sourceText.indexOf('\n\n');

  const headerEndIndex =
    headerEndCRLF >= 0 ? headerEndCRLF : headerEndLF >= 0 ? headerEndLF : -1;
  const headerSeparatorLength =
    headerEndCRLF >= 0 ? 4 : headerEndLF >= 0 ? 2 : 0;

  if (headerEndIndex < 0) {
    return null;
  }

  const headersText = sourceText.slice(0, headerEndIndex);
  const normalizedHeaders = headersText.replace(/\r?\n[ \t]+/g, ' ');

  const isMultipartEncrypted = /content-type:\s*multipart\/encrypted/i.test(
    normalizedHeaders
  );

  if (!isMultipartEncrypted) {
    return null;
  }

  const boundaryMatch = normalizedHeaders.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch?.[1]) {
    return null;
  }

  const boundary = boundaryMatch[1];
  const marker = `--${boundary}`;

  const bodyBuffer = source.subarray(headerEndIndex + headerSeparatorLength);
  const bodyText = bodyBuffer.toString('latin1');

  let firstMarker = bodyText.indexOf(marker);
  if (firstMarker < 0) {
    return null;
  }

  let part1Start = firstMarker + marker.length;
  if (bodyText.startsWith('\r\n', part1Start)) {
    part1Start += 2;
  } else if (bodyText.startsWith('\n', part1Start)) {
    part1Start += 1;
  }

  let secondMarker = bodyText.indexOf(`\r\n${marker}`, part1Start);
  let secondMarkerPrefixLength = 2;
  if (secondMarker < 0) {
    secondMarker = bodyText.indexOf(`\n${marker}`, part1Start);
    secondMarkerPrefixLength = 1;
  }
  if (secondMarker < 0) {
    return null;
  }

  let part2Start = secondMarker + secondMarkerPrefixLength + marker.length;
  if (bodyText.startsWith('\r\n', part2Start)) {
    part2Start += 2;
  } else if (bodyText.startsWith('\n', part2Start)) {
    part2Start += 1;
  }

  let thirdMarker = bodyText.indexOf(`\r\n${marker}`, part2Start);
  if (thirdMarker < 0) {
    thirdMarker = bodyText.indexOf(`\n${marker}`, part2Start);
  }
  if (thirdMarker < 0) {
    return null;
  }

  const part2Buffer = bodyBuffer.subarray(part2Start, thirdMarker);
  const part2Text = part2Buffer.toString('latin1');

  const part2HeaderEndCRLF = part2Text.indexOf('\r\n\r\n');
  const part2HeaderEndLF = part2Text.indexOf('\n\n');
  const part2HeaderEndIndex =
    part2HeaderEndCRLF >= 0
      ? part2HeaderEndCRLF
      : part2HeaderEndLF >= 0
        ? part2HeaderEndLF
        : -1;
  const part2HeaderSeparatorLength =
    part2HeaderEndCRLF >= 0 ? 4 : part2HeaderEndLF >= 0 ? 2 : 0;

  if (part2HeaderEndIndex < 0) {
    return null;
  }

  const encryptedBody = part2Buffer
    .subarray(part2HeaderEndIndex + part2HeaderSeparatorLength)
    .toString('utf8')
    .trim();

  if (!encryptedBody.includes('-----BEGIN PGP MESSAGE-----')) {
    return null;
  }

  return encryptedBody;
}

type MessageAttachmentContent = {
  filename: string | null;
  contentType: string;
  contentDisposition: string;
  content: Buffer;
};

/**
 * envelope などのアドレス配列から最初の 1 件を取得し、
 * "Name <address>" 形式の文字列で返します。
 */
function resolveFirstAddress(
  value: Array<{ name?: string | null; address?: string | null }> | undefined
) {
  const first = value?.[0];
  if (!first) return null;

  if (first.name && first.address) {
    return `${first.name} <${first.address}>`;
  }

  return first.address ?? first.name ?? null;
}

/**
 * 生ヘッダーテキストから、指定したフィールド名（fieldName）の値を
 * 折返しを解除した状態で取得します。
 */
function extractHeaderFieldValue(headersText: string, fieldName: string) {
  const unfolded = headersText.replace(/\r?\n[ \t]+/g, ' ');
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedFieldName}:\\s*(.+)$`, 'im');
  const matched = unfolded.match(pattern);
  return matched?.[1]?.trim() ?? null;
}

/**
 * References ヘッダーなどの文字列から、<id> 形式の ID 群を抽出します。
 */
function extractHeaderMessageIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const bracketMatched = Array.from(value.matchAll(/<([^>]+)>/g))
    .map(item => item[1]?.trim())
    .filter((item): item is string => Boolean(item));

  if (bracketMatched.length > 0) {
    return bracketMatched;
  }

  return value
    .split(/\s+/)
    .map(item => item.trim().replace(/^<+|>+$/g, ''))
    .filter(item => item.length > 0);
}

/**
 * メールのソース（Buffer）から、スレッド化に不可欠な
 * Message-Id, In-Reply-To, References を抽出します。
 */
function extractThreadHeadersFromSource(source: Buffer | null | undefined): {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
} {
  if (!source) {
    return {
      messageId: null,
      inReplyTo: null,
      references: [],
    };
  }

  const sourceText = source.toString('latin1');
  const headerEndCRLF = sourceText.indexOf('\r\n\r\n');
  const headerEndLF = sourceText.indexOf('\n\n');
  const headerEndIndex =
    headerEndCRLF >= 0 ? headerEndCRLF : headerEndLF >= 0 ? headerEndLF : -1;

  if (headerEndIndex < 0) {
    return {
      messageId: null,
      inReplyTo: null,
      references: [],
    };
  }

  const headersText = sourceText.slice(0, headerEndIndex);
  const messageId = extractHeaderFieldValue(headersText, 'Message-Id');
  const inReplyTo = extractHeaderFieldValue(headersText, 'In-Reply-To');
  const referencesRaw = extractHeaderFieldValue(headersText, 'References');

  return {
    messageId,
    inReplyTo,
    references: extractHeaderMessageIds(referencesRaw),
  };
}

/**
 * simpleParser でパースされた宛先オブジェクト（To/Cc など）を
 * カンマ区切りの文字列に変換します。
 */
function resolveParsedToAddress(value: unknown): string | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const list = value
      .map(item => {
        if (!item || typeof item !== 'object') return null;

        const target = item as { name?: string; address?: string };
        if (target.name && target.address) {
          return `${target.name} <${target.address}>`;
        }

        return target.address ?? target.name ?? null;
      })
      .filter((item): item is string => typeof item === 'string');

    return list.length > 0 ? list.join(', ') : null;
  }

  if (typeof value === 'object' && value !== null && 'text' in value) {
    const maybeText = (value as { text?: unknown }).text;
    return typeof maybeText === 'string' ? maybeText : null;
  }

  return null;
}

/**
 * bodyStructure ノードを再帰的に探索し、
 * コンテンツが 'attachment' であるパート（添付ファイル）があるか判定します。
 */
function hasAttachmentBody(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;

  const candidate = node as {
    disposition?: string;
    childNodes?: unknown[];
  };

  if (candidate.disposition?.toLowerCase() === 'attachment') {
    return true;
  }

  if (!Array.isArray(candidate.childNodes)) {
    return false;
  }

  return candidate.childNodes.some(child => hasAttachmentBody(child));
}

/**
 * 指定されたパース済みメール情報から、
 * それが PGP（GPG）署名済みである可能性が高いかを判定します。
 */
function isLikelyGpgSignedMessage(parsed: {
  text?: string | null;
  attachments?: Array<{
    contentType?: string | null;
    filename?: string | null;
  }>;
  headers?: {
    get(name: string): unknown;
  };
}): boolean {
  const hasInlineSignature =
    typeof parsed.text === 'string' &&
    parsed.text.includes('-----BEGIN PGP SIGNED MESSAGE-----');

  const hasSignatureAttachment = (parsed.attachments ?? []).some(item => {
    const contentType = (item.contentType ?? '').toLowerCase();
    const filename = (item.filename ?? '').toLowerCase();

    return (
      contentType.includes('application/pgp-signature') ||
      contentType.includes('pgp-signature') ||
      filename.endsWith('.asc') ||
      filename.endsWith('.sig')
    );
  });

  const contentTypeHeader = parsed.headers?.get('content-type');
  const headerText =
    typeof contentTypeHeader === 'string'
      ? contentTypeHeader.toLowerCase()
      : contentTypeHeader && typeof contentTypeHeader === 'object'
        ? JSON.stringify(contentTypeHeader).toLowerCase()
        : '';

  const hasMultipartSignedHeader =
    headerText.includes('multipart/signed') &&
    headerText.includes('application/pgp-signature');

  return (
    hasInlineSignature || hasSignatureAttachment || hasMultipartSignedHeader
  );
}

/**
 * 渡されたアカウント設定を用いて ImapFlow インスタンスを作成します。
 */
export function createImapClient(account: MailAccountConnection): ImapFlow {
  const password = decryptMailPassword({
    ciphertext: account.encryptedPassword,
    iv: account.encryptionIv,
    authTag: account.encryptionAuthTag,
  });

  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.username,
      pass: password,
    },
    logger: false,
  });
}

/**
 * IMAP クライアントの接続、操作（handler）、ログアウトをひとまとめに実行する
 * 高階関数です。エラー時の共通ログ出力も含みます。
 */
export async function withImapClient<T>(
  account: MailAccountConnection,
  handler: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = createImapClient(account);

  try {
    await client.connect();
    return await handler(client);
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    logger.error(
      {
        err: error,
        accountId: account.id,
        host: account.imapHost,
        port: account.imapPort,
      },
      'IMAP request failed'
    );

    throw createError({
      statusCode: 400,
      message: 'IMAPサーバー処理に失敗しました',
    });
  } finally {
    if (client.usable) {
      await client.logout().catch(() => {});
    }
  }
}

/**
 * 利用可能なメールボックス（フォルダ）一覧を取得します。
 */
export async function listMailboxes(account: MailAccountConnection) {
  return withImapClient(account, async client => {
    const mailboxes = await client.list();

    return mailboxes.map(box => ({
      path: box.path,
      name: box.name,
      specialUse: box.specialUse ?? null,
      listed: box.listed,
      subscribed: box.subscribed,
    }));
  });
}

/**
 * 指定されたフォルダ内のメール一覧を、最新の日付順で取得します。
 */
export async function listMessages(params: {
  account: MailAccountConnection;
  folder: string;
  limit: number;
}): Promise<MessageListItem[]> {
  return withImapClient(params.account, async client => {
    const mailbox = await client.mailboxOpen(params.folder);
    const total = mailbox.exists;

    if (total <= 0) {
      return [];
    }

    const start = Math.max(1, total - params.limit + 1);
    const sequenceRange = `${start}:${total}`;

    const messages: MessageListItem[] = [];
    for await (const message of client.fetch(
      sequenceRange,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        bodyStructure: true,
        flags: true,
        source: true,
      },
      { uid: false }
    )) {
      const threadHeaders = extractThreadHeadersFromSource(
        message.source ? Buffer.from(message.source) : null
      );

      messages.push({
        uid: message.uid,
        subject: message.envelope?.subject ?? null,
        from: resolveFirstAddress(message.envelope?.from),
        date: message.internalDate
          ? new Date(message.internalDate).toISOString()
          : null,
        messageId:
          threadHeaders.messageId ??
          (message.envelope as { messageId?: string | null } | undefined)
            ?.messageId ??
          null,
        inReplyTo:
          threadHeaders.inReplyTo ??
          (message.envelope as { inReplyTo?: string | null } | undefined)
            ?.inReplyTo ??
          null,
        references: threadHeaders.references,
        hasAttachment: hasAttachmentBody(message.bodyStructure),
        seen: message.flags?.has('\\Seen') ?? false,
      });
    }

    return messages
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;

        if (timeA !== timeB) {
          return timeB - timeA;
        }

        return b.uid - a.uid;
      })
      .slice(0, params.limit);
  });
}

/**
 * フォルダ内の最新メッセージのフラグ（既読状態のみなど）を軽量に取得します。
 */
export async function listLatestMessageFlags(params: {
  account: MailAccountConnection;
  folder: string;
  limit: number;
}): Promise<MessageFlagItem[]> {
  return withImapClient(params.account, async client => {
    const mailbox = await client.mailboxOpen(params.folder);
    const total = mailbox.exists;

    if (total <= 0) {
      return [];
    }

    const start = Math.max(1, total - params.limit + 1);
    const sequenceRange = `${start}:${total}`;

    const flags: MessageFlagItem[] = [];
    for await (const message of client.fetch(
      sequenceRange,
      {
        uid: true,
        flags: true,
      },
      { uid: false }
    )) {
      flags.push({
        uid: message.uid,
        seen: message.flags?.has('\\Seen') ?? false,
      });
    }

    return flags.reverse();
  });
}

/**
 * 特定の UID (afterUid) よりも大きい（新しい）メッセージを同期するために取得します。
 */
export async function listMessagesSinceUid(params: {
  account: MailAccountConnection;
  folder: string;
  afterUid: number;
  limit: number;
}): Promise<MessageListItem[]> {
  if (params.afterUid < 0) {
    return [];
  }

  return withImapClient(params.account, async client => {
    await client.mailboxOpen(params.folder);

    const messages: MessageListItem[] = [];
    const uidRange = `${params.afterUid + 1}:*`;

    for await (const message of client.fetch(
      uidRange,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        bodyStructure: true,
        flags: true,
        source: true,
      },
      { uid: true }
    )) {
      const threadHeaders = extractThreadHeadersFromSource(
        message.source ? Buffer.from(message.source) : null
      );

      messages.push({
        uid: message.uid,
        subject: message.envelope?.subject ?? null,
        from: resolveFirstAddress(message.envelope?.from),
        date: message.internalDate
          ? new Date(message.internalDate).toISOString()
          : null,
        messageId:
          threadHeaders.messageId ??
          (message.envelope as { messageId?: string | null } | undefined)
            ?.messageId ??
          null,
        inReplyTo:
          threadHeaders.inReplyTo ??
          (message.envelope as { inReplyTo?: string | null } | undefined)
            ?.inReplyTo ??
          null,
        references: threadHeaders.references,
        hasAttachment: hasAttachmentBody(message.bodyStructure),
        seen: message.flags?.has('\\Seen') ?? false,
      });
    }

    return messages
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;

        if (timeA !== timeB) {
          return timeB - timeA;
        }

        return b.uid - a.uid;
      })
      .slice(0, params.limit);
  });
}

/**
 * フォルダの STATUS を確認し、存在する総メッセージ数を返します。
 */
export async function getMailboxMessageCount(params: {
  account: MailAccountConnection;
  folder: string;
}) {
  return withImapClient(params.account, async client => {
    const status = await client.status(params.folder, { messages: true });
    return status.messages ?? 0;
  });
}

type SpecialFolderKind = 'trash' | 'archive' | 'inbox' | 'sent' | 'drafts';

// システム予約語（フォルダ名）のリスト。
const PROTECTED_FOLDER_EXACT_NAMES = [
  'inbox',
  'draft',
  'drafts',
  'spam',
  'junk',
  'trash',
  'bin',
  'deleted items',
  'sent',
  'sent items',
  'archive',
  'all mail',
  'ごみ箱',
  '下書き',
  '送信済み',
  '迷惑メール',
  'アーカイブ',
];

/**
 * フォルダ名を小文字化・トリムして比較しやすくします。
 */
function normalizeMailboxPath(path: string) {
  return path.trim().toLowerCase();
}

/**
 * システム予約フォルダ（ゴミ箱、下書き等）や
 * specialUse でマークされた特別なフォルダかどうかを判定します。
 */
function isProtectedMailbox(mailbox: {
  path: string;
  specialUse?: string | null;
}) {
  if (mailbox.specialUse) {
    return true;
  }

  const normalized = normalizeMailboxPath(mailbox.path);
  if (PROTECTED_FOLDER_EXACT_NAMES.includes(normalized)) {
    return true;
  }

  const slashSegment = normalized.split('/').pop() ?? normalized;
  if (PROTECTED_FOLDER_EXACT_NAMES.includes(slashSegment)) {
    return true;
  }

  const dotSegment = normalized.split('.').pop() ?? normalized;
  if (PROTECTED_FOLDER_EXACT_NAMES.includes(dotSegment)) {
    return true;
  }

  return false;
}

/**
 * 送信済み、ゴミ箱、アーカイブなど、役割に応じた
 * IMAP フォルダパスを判定・解決します。
 */
function resolveSpecialFolderPath(
  mailboxes: Array<{ path: string; specialUse?: string | null }>,
  kind: SpecialFolderKind
) {
  if (kind === 'inbox') {
    const inboxSpecial = mailboxes.find(
      mailbox => mailbox.specialUse?.toLowerCase() === '\\inbox'
    );

    if (inboxSpecial) {
      return inboxSpecial.path;
    }

    const byPath = mailboxes.find(
      mailbox => mailbox.path.toUpperCase() === 'INBOX'
    );
    return byPath?.path ?? 'INBOX';
  }

  const specialNames =
    kind === 'trash'
      ? ['\\Trash']
      : kind === 'archive'
        ? ['\\Archive', '\\All', '\\AllMail']
        : kind === 'sent'
          ? ['\\Sent']
          : ['\\Drafts'];

  const normalizedSpecialNames = specialNames.map(item => item.toLowerCase());

  const bySpecialUse = mailboxes.find(mailbox => {
    const normalized = (mailbox.specialUse ?? '')
      .replaceAll('\\\\', '\\')
      .toLowerCase();

    return normalizedSpecialNames.includes(normalized);
  });

  if (bySpecialUse) {
    return bySpecialUse.path;
  }

  const fallbackNames =
    kind === 'trash'
      ? ['trash', 'deleted', 'deleted items', 'ごみ箱']
      : kind === 'archive'
        ? ['archive', 'all mail', 'allmail', '[gmail]/all mail', 'アーカイブ']
        : kind === 'sent'
          ? ['sent', 'sent items', '送信済み', '[gmail]/sent mail']
          : ['drafts', 'draft', '下書き', '[gmail]/drafts'];

  const byName = mailboxes.find(mailbox => {
    const lowerPath = mailbox.path.toLowerCase();
    return fallbackNames.some(name => lowerPath.includes(name));
  });

  return byName?.path ?? null;
}

/**
 * メッセージの \Seen フラグを追加または削除（既読/未読切り替え）します。
 */
export async function updateSeenFlag(params: {
  account: MailAccountConnection;
  folder: string;
  uid: number;
  seen: boolean;
}) {
  return withImapClient(params.account, async client => {
    await client.mailboxOpen(params.folder);

    if (params.seen) {
      await client.messageFlagsAdd(params.uid, ['\\Seen'], { uid: true });
    } else {
      await client.messageFlagsRemove(params.uid, ['\\Seen'], { uid: true });
    }

    return { uid: params.uid, seen: params.seen };
  });
}

/**
 * ゴミ箱移動やアーカイブなど、定義済みの SpecialFolderKind への移動を行います。
 */
export async function moveMessage(params: {
  account: MailAccountConnection;
  folder: string;
  uid: number;
  destination: SpecialFolderKind;
}) {
  return withImapClient(params.account, async client => {
    await client.mailboxOpen(params.folder);

    const mailboxes = await client.list();
    let destinationPath = resolveSpecialFolderPath(
      mailboxes,
      params.destination
    );

    if (!destinationPath && params.destination === 'archive') {
      const archiveFallbackPath = 'Archive';

      try {
        await client.mailboxCreate(archiveFallbackPath);
      } catch {
        // ignore creation errors and try resolution again
      }

      const refreshedMailboxes = await client.list();
      destinationPath =
        resolveSpecialFolderPath(refreshedMailboxes, 'archive') ??
        archiveFallbackPath;
    }

    if (!destinationPath) {
      throw createError({
        statusCode: 400,
        message:
          params.destination === 'trash'
            ? 'ゴミ箱フォルダが見つかりません'
            : params.destination === 'archive'
              ? 'アーカイブフォルダが見つかりません'
              : '受信トレイが見つかりません',
      });
    }

    if (destinationPath === params.folder) {
      return {
        uid: params.uid,
        from: params.folder,
        to: destinationPath,
      };
    }

    await client.messageMove(params.uid, destinationPath, { uid: true });

    return {
      uid: params.uid,
      from: params.folder,
      to: destinationPath,
    };
  });
}

/**
 * メッセージを特定のフォルダパス（toFolder）へ移動します。
 */
export async function moveMessageToFolder(params: {
  account: MailAccountConnection;
  fromFolder: string;
  toFolder: string;
  uid: number;
}) {
  return withImapClient(params.account, async client => {
    await client.mailboxOpen(params.fromFolder);

    if (params.fromFolder === params.toFolder) {
      return {
        uid: params.uid,
        from: params.fromFolder,
        to: params.toFolder,
      };
    }

    await client.messageMove(params.uid, params.toFolder, { uid: true });

    return {
      uid: params.uid,
      from: params.fromFolder,
      to: params.toFolder,
    };
  });
}

/**
 * 送信済みメールを IMAP の送信済みフォルダに保存（APPEND）します。
 */
export async function appendToSentMailbox(params: {
  account: MailAccountConnection;
  rawMessage: Buffer;
}) {
  return withImapClient(params.account, async client => {
    const mailboxes = await client.list();
    const sentPath = resolveSpecialFolderPath(mailboxes, 'sent');

    if (!sentPath) {
      return {
        stored: false,
        mailbox: null,
      };
    }

    await client.append(sentPath, params.rawMessage, ['\\Seen'], new Date());

    return {
      stored: true,
      mailbox: sentPath,
    };
  });
}

/**
 * 作成中のメールを下書きフォルダに保存（APPEND）します。
 */
export async function appendToDraftMailbox(params: {
  account: MailAccountConnection;
  rawMessage: Buffer;
}) {
  return withImapClient(params.account, async client => {
    const mailboxes = await client.list();
    const draftsPath = resolveSpecialFolderPath(mailboxes, 'drafts');

    if (!draftsPath) {
      return {
        stored: false,
        mailbox: null,
      };
    }

    await client.append(
      draftsPath,
      params.rawMessage,
      ['\\Seen', '\\Draft'],
      new Date()
    );

    return {
      stored: true,
      mailbox: draftsPath,
    };
  });
}

/**
 * 任意の名称で新規フォルダ（メールボックス）を作成します。
 */
export async function createCustomMailbox(params: {
  account: MailAccountConnection;
  name: string;
}) {
  const folderName = params.name.trim();

  if (folderName.length === 0) {
    throw createError({
      statusCode: 422,
      message: 'フォルダ名を入力してください',
    });
  }

  const normalizedName = folderName.toLowerCase();
  if (
    PROTECTED_FOLDER_EXACT_NAMES.some(keyword => normalizedName === keyword)
  ) {
    throw createError({
      statusCode: 422,
      message: 'この名前は予約済みのため使用できません',
    });
  }

  return withImapClient(params.account, async client => {
    await client.mailboxCreate(folderName);
    return {
      ok: true,
      path: folderName,
    };
  });
}

/**
 * フォルダの名称を変更（RENAME）します。
 */
export async function renameCustomMailbox(params: {
  account: MailAccountConnection;
  path: string;
  newName: string;
}) {
  const newName = params.newName.trim();

  if (!params.path.trim()) {
    throw createError({
      statusCode: 422,
      message: '変更対象フォルダが不正です',
    });
  }

  if (!newName) {
    throw createError({
      statusCode: 422,
      message: '新しいフォルダ名を入力してください',
    });
  }

  return withImapClient(params.account, async client => {
    const mailboxes = await client.list();
    const target = mailboxes.find(mailbox => mailbox.path === params.path);

    if (!target) {
      throw createError({
        statusCode: 404,
        message: 'フォルダが見つかりません',
      });
    }

    if (isProtectedMailbox(target)) {
      throw createError({
        statusCode: 403,
        message: '重要フォルダは変更できません',
      });
    }

    await client.mailboxRename(params.path, newName);

    return {
      ok: true,
      from: params.path,
      to: newName,
    };
  });
}

/**
 * フォルダを削除します。重要フォルダ（受信トレイ等）は削除できません。
 */
export async function deleteCustomMailbox(params: {
  account: MailAccountConnection;
  path: string;
}) {
  const path = params.path.trim();

  if (!path) {
    throw createError({
      statusCode: 422,
      message: '削除対象フォルダが不正です',
    });
  }

  return withImapClient(params.account, async client => {
    const mailboxes = await client.list();
    const target = mailboxes.find(mailbox => mailbox.path === path);

    if (!target) {
      throw createError({
        statusCode: 404,
        message: 'フォルダが見つかりません',
      });
    }

    if (isProtectedMailbox(target)) {
      throw createError({
        statusCode: 403,
        message: '重要フォルダは削除できません',
      });
    }

    await client.mailboxDelete(path);

    return {
      ok: true,
      deleted: path,
    };
  });
}

/**
 * 特定のメールの詳細情報（本文、添付メタデータ、PGP署名/暗号状況、下書きメタ等）を取得します。
 * 本文のパースには mailparser (simpleParser) を使用し、
 * PGP/MIME 構造は独自パーサ（extractMultipart...）で補完します。
 */
export async function getMessageDetail(params: {
  account: MailAccountConnection;
  folder: string;
  uid: number;
}): Promise<MessageDetail> {
  return withImapClient(params.account, async client => {
    await client.mailboxOpen(params.folder);

    const fetched = await client.fetchOne(
      params.uid,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true,
      },
      { uid: true }
    );

    if (!fetched || !fetched.source) {
      throw createError({
        statusCode: 404,
        message: 'メールが見つかりません',
      });
    }

    const message = fetched;
    const source = message.source;

    if (!source) {
      throw createError({
        statusCode: 404,
        message: 'メールが見つかりません',
      });
    }

    // MIME メッセージの基本構造を解析
    const parsed = await simpleParser(Buffer.from(source));

    // PGP 暗号化パケットの抽出 (multipart/encrypted または添付ファイル形式)
    const multipartEncryptedMessage = extractMultipartEncryptedMessage(
      Buffer.from(source)
    );
    const pgpDetachedSignatureAttachment = parsed.attachments.find(item => {
      const contentType = (item.contentType ?? '').toLowerCase();
      const filename = (item.filename ?? '').toLowerCase();
      return (
        contentType.includes('application/pgp-signature') ||
        filename.endsWith('.sig') ||
        filename === 'signature.asc'
      );
    });

    const pgpDetachedSignature = pgpDetachedSignatureAttachment
      ? (Buffer.isBuffer(pgpDetachedSignatureAttachment.content)
          ? pgpDetachedSignatureAttachment.content
          : Buffer.from(pgpDetachedSignatureAttachment.content)
        ).toString('utf8')
      : null;

    const pgpEncryptedAttachment = parsed.attachments.find(item => {
      const contentType = (item.contentType ?? '').toLowerCase();
      const filename = (item.filename ?? '').toLowerCase();

      return (
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/pgp-encrypted') ||
        filename === 'encrypted.asc' ||
        filename === 'message.asc'
      );
    });

    const pgpEncryptedAttachmentBody = pgpEncryptedAttachment
      ? (Buffer.isBuffer(pgpEncryptedAttachment.content)
          ? pgpEncryptedAttachment.content
          : Buffer.from(pgpEncryptedAttachment.content)
        )
          .toString('utf8')
          .trim()
      : null;

    const pgpEncryptedMessage =
      multipartEncryptedMessage ??
      (pgpEncryptedAttachmentBody?.includes('-----BEGIN PGP MESSAGE-----')
        ? pgpEncryptedAttachmentBody
        : null);

    // PGP 署名情報の抽出 (multipart/signed)
    const multipartSignedParts = extractMultipartSignedParts(
      Buffer.from(source)
    );
    const detachedSignature =
      multipartSignedParts.detachedSignature ?? pgpDetachedSignature;
    const detachedSignedDataBase64 =
      multipartSignedParts.signedDataBase64 ?? null;

    // 下書き復元用の独自ヘッダー (x-pitamai-draft-recipients等) の取得
    const recipientMetaHeader = parsed.headers.get(
      'x-pitamai-draft-recipients'
    );
    const draftToHeader = parsed.headers.get('x-draft-to');
    const draftCcHeader = parsed.headers.get('x-draft-cc');
    const draftBccHeader = parsed.headers.get('x-draft-bcc');

    const recipientMetaRaw =
      typeof recipientMetaHeader === 'string' ? recipientMetaHeader : null;
    let recipientMeta: {
      to: string | null;
      cc: string | null;
      bcc: string | null;
    } | null = null;

    if (recipientMetaRaw) {
      try {
        const decoded = Buffer.from(recipientMetaRaw, 'base64').toString(
          'utf8'
        );
        const parsedMeta = JSON.parse(decoded) as {
          to?: string | null;
          cc?: string | null;
          bcc?: string | null;
        };

        recipientMeta = {
          to: typeof parsedMeta.to === 'string' ? parsedMeta.to : null,
          cc: typeof parsedMeta.cc === 'string' ? parsedMeta.cc : null,
          bcc: typeof parsedMeta.bcc === 'string' ? parsedMeta.bcc : null,
        };
      } catch {
        recipientMeta = null;
      }
    }

    const draftTo = typeof draftToHeader === 'string' ? draftToHeader : null;
    const draftCc = typeof draftCcHeader === 'string' ? draftCcHeader : null;
    const draftBcc = typeof draftBccHeader === 'string' ? draftBccHeader : null;

    return {
      uid: message.uid,

      subject: parsed.subject ?? message.envelope?.subject ?? null,
      from: parsed.from?.text ?? resolveFirstAddress(message.envelope?.from),
      to:
        recipientMeta?.to ??
        resolveParsedToAddress(parsed.to) ??
        resolveFirstAddress(message.envelope?.to) ??
        draftTo,
      cc:
        recipientMeta?.cc ??
        resolveParsedToAddress(parsed.cc) ??
        resolveFirstAddress(message.envelope?.cc) ??
        draftCc,
      bcc:
        recipientMeta?.bcc ??
        resolveParsedToAddress(parsed.bcc) ??
        resolveFirstAddress(message.envelope?.bcc) ??
        draftBcc,
      date: message.internalDate
        ? new Date(message.internalDate).toISOString()
        : parsed.date
          ? parsed.date.toISOString()
          : null,
      text: parsed.text ?? null,
      html: typeof parsed.html === 'string' ? parsed.html : null,
      attachments: parsed.attachments.map(attachment => ({
        filename: attachment.filename ?? null,
        contentType: attachment.contentType,
        size: attachment.size,
        contentDisposition: attachment.contentDisposition,
      })),
      isGpgSigned: isLikelyGpgSignedMessage(parsed),
      pgpDetachedSignature: detachedSignature,
      pgpDetachedSignedDataBase64: detachedSignedDataBase64,
      pgpEncryptedMessage,
    };
  });
}

/**
 * メール内の特定の添付ファイルの内容（Buffer）を取得します。
 */
export async function getMessageAttachment(params: {
  account: MailAccountConnection;
  folder: string;
  uid: number;
  index: number;
}): Promise<MessageAttachmentContent> {
  return withImapClient(params.account, async client => {
    await client.mailboxOpen(params.folder);

    const fetched = await client.fetchOne(
      params.uid,
      {
        source: true,
      },
      { uid: true }
    );

    if (!fetched || !fetched.source) {
      throw createError({
        statusCode: 404,
        message: 'メールが見つかりません',
      });
    }

    const parsed = await simpleParser(Buffer.from(fetched.source));
    const attachment = parsed.attachments[params.index];

    if (!attachment || !attachment.content) {
      throw createError({
        statusCode: 404,
        message: '添付ファイルが見つかりません',
      });
    }

    return {
      filename: attachment.filename ?? null,
      contentType: attachment.contentType,
      contentDisposition: attachment.contentDisposition,
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(attachment.content),
    };
  });
}
