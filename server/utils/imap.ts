import { createError } from 'h3';
import { ImapFlow } from 'imapflow';
import type { MailAccount } from '@prisma/client';
import { simpleParser } from 'mailparser';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
import { logger } from '~~/server/utils/logger';

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
  hasAttachment: boolean;
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
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: MessageAttachment[];
};

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
      },
      { uid: false }
    )) {
      messages.push({
        uid: message.uid,
        subject: message.envelope?.subject ?? null,
        from: resolveFirstAddress(message.envelope?.from),
        date: message.internalDate
          ? new Date(message.internalDate).toISOString()
          : null,
        hasAttachment: hasAttachmentBody(message.bodyStructure),
        seen: message.flags?.has('\\Seen') ?? false,
      });
    }

    return messages.reverse();
  });
}

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
      },
      { uid: true }
    )) {
      messages.push({
        uid: message.uid,
        subject: message.envelope?.subject ?? null,
        from: resolveFirstAddress(message.envelope?.from),
        date: message.internalDate
          ? new Date(message.internalDate).toISOString()
          : null,
        hasAttachment: hasAttachmentBody(message.bodyStructure),
        seen: message.flags?.has('\\Seen') ?? false,
      });
    }

    return messages.slice(-params.limit);
  });
}

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

function normalizeMailboxPath(path: string) {
  return path.trim().toLowerCase();
}

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

    const parsed = await simpleParser(Buffer.from(source));

    return {
      uid: message.uid,
      subject: parsed.subject ?? message.envelope?.subject ?? null,
      from: parsed.from?.text ?? resolveFirstAddress(message.envelope?.from),
      to:
        resolveParsedToAddress(parsed.to) ??
        resolveFirstAddress(message.envelope?.to),
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
    };
  });
}
