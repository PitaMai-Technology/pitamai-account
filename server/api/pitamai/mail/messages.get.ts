/**
 * server/api/pitamai/mail/messages.get.ts
 *
 * 指定フォルダのメッセージ一覧を取得する API。
 * キャッシュ付き or 強制同期モードを選択できる。
 * 結果には使用した戦略とキャッシュ件数が含まれる。
 */
import { createError, getQuery } from 'h3';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import {
  getMessagesWithCacheFallback,
  syncFolderMessages,
} from '~~/server/utils/mail-sync';

// クエリパラメータ: forceSync を true にするとキャッシュを無視して IMAP 直接同期
const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  folder: z.string().min(1).default('INBOX'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  forceSync: z.coerce.boolean().optional().default(false),
});

export default defineEventHandler(async event => {
  // パラメータ検証
  const parsed = querySchema.safeParse(getQuery(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  // アカウント解決
  const account = await requireMailAccountForUser({
    event,
    accountId: parsed.data.accountId,
  });

  // forceSync による振り分け
  const result = parsed.data.forceSync
    ? await (async () => {
        const synced = await syncFolderMessages({
          account,
          folder: parsed.data.folder,
          limit: parsed.data.limit,
        });

        return {
          source: 'imap' as const,
          strategy: synced.strategy,
          messages: synced.messages,
          cachedCount: 0,
        };
      })()
    : await getMessagesWithCacheFallback({
        account,
        folder: parsed.data.folder,
        limit: parsed.data.limit,
      });

  // 結果返却
  return {
    accountId: account.id,
    folder: parsed.data.folder,
    source: result.source,
    strategy: result.strategy,
    cachedCount: result.cachedCount,
    messages: result.messages,
  };
});
