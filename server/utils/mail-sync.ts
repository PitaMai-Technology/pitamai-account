import type { MailAccount } from '@prisma/client';
import {
  getCachedMessages,
  getMaxCachedUid,
  pruneCache,
  upsertMessagesToCache,
} from '~~/server/utils/mail-cache';
import { listMessages, listMessagesSinceUid } from '~~/server/utils/imap';

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

export async function syncFolderMessages(params: {
  account: MailAccountConnection;
  folder: string;
  limit: number;
}) {
  const maxUid = await getMaxCachedUid({
    accountId: params.account.id,
    folder: params.folder,
  });

  if (maxUid === null) {
    const fullMessages = await listMessages({
      account: params.account,
      folder: params.folder,
      limit: Math.max(params.limit, 200),
    });

    await upsertMessagesToCache({
      accountId: params.account.id,
      folder: params.folder,
      messages: fullMessages,
    });

    await pruneCache({
      accountId: params.account.id,
      folder: params.folder,
      keep: 500,
    });

    return {
      strategy: 'full' as const,
      messages: fullMessages.slice(0, params.limit),
    };
  }

  const diffMessages = await listMessagesSinceUid({
    account: params.account,
    folder: params.folder,
    afterUid: maxUid,
    limit: 200,
  });

  if (diffMessages.length > 0) {
    await upsertMessagesToCache({
      accountId: params.account.id,
      folder: params.folder,
      messages: diffMessages,
    });
  }

  const latest = await listMessages({
    account: params.account,
    folder: params.folder,
    limit: params.limit,
  });

  await upsertMessagesToCache({
    accountId: params.account.id,
    folder: params.folder,
    messages: latest,
  });

  await pruneCache({
    accountId: params.account.id,
    folder: params.folder,
    keep: 500,
  });

  return {
    strategy: 'diff' as const,
    messages: latest,
  };
}

export async function getMessagesWithCacheFallback(params: {
  account: MailAccountConnection;
  folder: string;
  limit: number;
}) {
  const cached = await getCachedMessages({
    accountId: params.account.id,
    folder: params.folder,
    limit: params.limit,
  });

  try {
    const synced = await syncFolderMessages(params);
    return {
      source: 'imap' as const,
      strategy: synced.strategy,
      messages: synced.messages,
      cachedCount: cached.length,
    };
  } catch {
    return {
      source: 'cache' as const,
      strategy: 'fallback' as const,
      messages: cached,
      cachedCount: cached.length,
    };
  }
}
