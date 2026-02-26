/**
 * server/api/pitamai/mail/folder-delete.post.ts
 *
 * 指定されたカスタムメールボックスを IMAP から削除し、
 * 最新のフォルダ一覧を返すエンドポイント。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { deleteCustomMailbox, listMailboxes } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

// リクエストボディバリデーション: 削除対象パス
const bodySchema = z.object({
  path: z.string().min(1),
});

export default defineEventHandler(async event => {
  // 認証アカウントの取得
  const account = await requireMailAccountForUser({ event });
  const body = await readBody(event);

  // バリデーション
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  // メールボックス削除
  await deleteCustomMailbox({
    account,
    path: parsed.data.path,
  });

  // 更新後の一覧を返却
  const mailboxes = await listMailboxes(account);

  return {
    ok: true,
    mailboxes,
  };
});
