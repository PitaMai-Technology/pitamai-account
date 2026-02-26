/**
 * server/api/pitamai/mail/move.post.ts
 *
 * メッセージを標準フォルダ（trash/archive/inbox）へ移動するAPI。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { moveMessage } from '~~/server/utils/imap';

// リクエストボディ検証
const bodySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
  uid: z.number().int().min(1),
  destination: z.enum(['trash', 'archive', 'inbox']),
});

export default defineEventHandler(async event => {
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
});
