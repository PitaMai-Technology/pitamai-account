import { createError, getQuery } from 'h3';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import {
  getMessagesWithCacheFallback,
  syncFolderMessages,
} from '~~/server/utils/mail-sync';

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  folder: z.string().min(1).default('INBOX'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  forceSync: z.coerce.boolean().optional().default(false),
});

export default defineEventHandler(async event => {
  const parsed = querySchema.safeParse(getQuery(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  const account = await requireMailAccountForUser({
    event,
    accountId: parsed.data.accountId,
  });

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

  return {
    accountId: account.id,
    folder: parsed.data.folder,
    source: result.source,
    strategy: result.strategy,
    cachedCount: result.cachedCount,
    messages: result.messages,
  };
});
