/**
 * server/api/pitamai/mail/message.get.ts
 *
 * 指定アカウント/フォルダ/UID のメール本文詳細を取得し
 * HTML 部分をサニタイズして返却するエンドポイント。
 */
import { createError, getQuery } from 'h3';
import { z } from 'zod';
import { logger } from '~~/server/utils/logger';
import { getMessageDetail } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { sanitizeMailHtml } from '~~/server/utils/mail-sanitize';

// クエリパラメータのバリデーション
const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  folder: z.string().min(1).default('INBOX'),
  uid: z.coerce.number().int().min(1),
});

export default defineEventHandler(async event => {
  try {
    // クエリ検証
    const parsed = querySchema.safeParse(getQuery(event));

    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    // アカウント取得
    const account = await requireMailAccountForUser({
      event,
      accountId: parsed.data.accountId,
    });

    // メッセージ詳細取得
    const message = await getMessageDetail({
      account,
      folder: parsed.data.folder,
      uid: parsed.data.uid,
    });

    // HTML 部分をサニタイズして返却
    return {
      accountId: account.id,
      folder: parsed.data.folder,
      message: {
        ...message,
        html: message.html ? sanitizeMailHtml(message.html) : null,
      },
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail message detail error');
      throw createError({
        statusCode: 400,
        message: 'メッセージ詳細の取得に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
