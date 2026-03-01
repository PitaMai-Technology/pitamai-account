/**
 * server/api/pitamai/mail/move.post.ts
 *
 * メッセージを標準フォルダ（trash/archive/inbox）へ移動するAPI。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { logger } from '~~/server/utils/logger';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { moveMessage } from '~~/server/utils/imap';

// リクエストボディ検証
const bodySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
  uid: z.number().int().min(1),
  destination: z.enum(['trash', 'archive', 'inbox']),
});

export default defineEventHandler(async event => {
  try {
    // 認証アカウント取得
    const account = await requireMailAccountForUser({ event });
    const body = await readBody(event);

    // バリデーション
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    // 標準フォルダへの移動
    const result = await moveMessage({
      account,
      folder: parsed.data.folder,
      uid: parsed.data.uid,
      destination: parsed.data.destination,
    });

    return { ok: true, result };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail message move standard folder error');
      throw createError({
        statusCode: 400,
        message: 'メッセージの移動に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
