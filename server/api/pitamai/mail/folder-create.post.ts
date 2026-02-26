/**
 * server/api/pitamai/mail/folder-create.post.ts
 *
 * IMAP 上にカスタムフォルダを作成し、最新のフォルダリストを返す API。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { createCustomMailbox, listMailboxes } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

// リクエストボディスキーマ: フォルダ名を受け取る
const bodySchema = z.object({
  name: z.string().min(1),
});

export default defineEventHandler(async event => {
  // 認証済みアカウント取得
  const account = await requireMailAccountForUser({ event });
  const body = await readBody(event);

  // バリデーション
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  // フォルダ作成
  await createCustomMailbox({
    account,
    name: parsed.data.name,
  });

  // 作成後のフォルダ一覧を返却
  const mailboxes = await listMailboxes(account);

  return {
    ok: true,
    mailboxes,
  };
});
