/**
 * server/api/pitamai/mail/seen.post.ts
 *
 * メールの "seen" フラグを IMAP サーバー上で更新する API。
 * クライアントはフォルダ名、UID、および boolean の状態を送信する。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { logger } from '~~/server/utils/logger';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { updateSeenFlag } from '~~/server/utils/imap';

// リクエストボディ検証スキーマ
const bodySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
  uid: z.number().int().min(1),
  seen: z.boolean(),
});

export default defineEventHandler(async event => {
  try {
    // 認証済みアカウントを取得
    const account = await requireMailAccountForUser({ event });
    const body = await readBody(event);

    // バリデーション
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    // IMAP フラグ更新
    const result = await updateSeenFlag({
      account,
      folder: parsed.data.folder,
      uid: parsed.data.uid,
      seen: parsed.data.seen,
    });

    return { ok: true, result };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail message seen flag update error');
      throw createError({
        statusCode: 400,
        message: 'メッセージの既読フラグ更新に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
