/**
 * server/utils/mail-sync.ts
 *
 * IMAP とローカルキャッシュ間のメッセージ同期ロジック。
 *
 * - フォルダごとに新着差分を取得し DB キャッシュを更新する
 * - キャッシュのみで十分な場合はリモート問い合わせを最小化
 * - フォールバック用にキャッシュのみを返すヘルパー関数も提供
 */
import type { MailAccount } from '@prisma/client';
import {
  getCachedMessageCount,
  getCachedMessages,
  getMaxCachedUid,
  pruneCache,
  upsertMessagesToCache,
} from '~~/server/utils/mail-cache';
import {
  getMailboxMessageCount,
  listLatestMessageFlags,
  listMessages,
  listMessagesSinceUid,
} from '~~/server/utils/imap';

/**
 * IMAP 接続に必要な MailAccount サブセット。
 * @typedef {object} MailAccountConnection
 * @property {string} id
 * @property {string} imapHost
 * @property {number} imapPort
 * @property {boolean} imapSecure
 * @property {string} username
 * @property {string} encryptedPassword
 * @property {string} encryptionIv
 * @property {string} encryptionAuthTag
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

/**
 * 指定フォルダのメッセージを同期し、結果と使用した戦略を返す。
 *
 * 戦略:
 * - full: キャッシュが空で、最大UIDが取得できない場合に全件取得
 * - diff: キャッシュとリモート両方を更新し最新一覧を返却
 * - diff-cache: 差分なしかつ件数一致の場合、キャッシュを再利用して最小限のフラグのみ更新
 *
 * @param {{account: MailAccountConnection, folder: string, limit: number}} params
 * @returns {Promise<{strategy: 'full'|'diff'|'diff-cache'; messages: any[]}>}
 */
export async function syncFolderMessages(params: {
  account: MailAccountConnection;
  folder: string;
  limit: number;
}) {
  const cachedTop = await getCachedMessages({
    accountId: params.account.id,
    folder: params.folder,
    limit: params.limit,
  });

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

  const [remoteCount, cachedCount] = await Promise.all([
    getMailboxMessageCount({
      account: params.account,
      folder: params.folder,
    }),
    getCachedMessageCount({
      accountId: params.account.id,
      folder: params.folder,
    }),
  ]);

  if (diffMessages.length > 0) {
    await upsertMessagesToCache({
      accountId: params.account.id,
      folder: params.folder,
      messages: diffMessages,
    });
  }

  const shouldUseCacheOnly =
    diffMessages.length === 0 &&
    cachedTop.length > 0 &&
    remoteCount === cachedCount;

  if (shouldUseCacheOnly) {
    const latestFlags = await listLatestMessageFlags({
      account: params.account,
      folder: params.folder,
      limit: params.limit,
    });

    const seenMap = new Map(latestFlags.map(item => [item.uid, item.seen]));
    const messages = cachedTop.map(message => ({
      ...message,
      seen: seenMap.get(message.uid) ?? message.seen,
    }));

    return {
      strategy: 'diff-cache' as const,
      messages,
    };
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

/**
 * キャッシュを読み込みつつ同期を試み、失敗した場合はキャッシュのみを返す。
 *
 * @param {{account: MailAccountConnection, folder: string, limit: number}} params
 * @returns {Promise<{source: 'imap'|'cache', strategy: string, messages: any[], cachedCount: number}>}
 */
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
