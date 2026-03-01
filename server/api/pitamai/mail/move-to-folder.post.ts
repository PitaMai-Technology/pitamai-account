/**
 * server/api/pitamai/mail/move-to-folder.post.ts
 *
 * メッセージを指定フォルダから別フォルダへ移動する API。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { logger } from '~~/server/utils/logger';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { moveMessageToFolder } from '~~/server/utils/imap';

// リクエストのバリデーションスキーマ
const bodySchema = z.object({
  fromFolder: z.string().min(1),
  toFolder: z.string().min(1),
  uid: z.number().int().min(1),
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

    // フォルダ移動
    const result = await moveMessageToFolder({
      account,
      fromFolder: parsed.data.fromFolder,
      toFolder: parsed.data.toFolder,
      uid: parsed.data.uid,
    });

    return { ok: true, result };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail message move error');
      throw createError({
        statusCode: 400,
        message: 'メッセージの移動に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
