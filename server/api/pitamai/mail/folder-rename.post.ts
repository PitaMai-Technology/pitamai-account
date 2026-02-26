/**
 * server/api/pitamai/mail/folder-rename.post.ts
 *
 * カスタムメールボックス（フォルダ）の名前を変更し、
 * 変更後の一覧を返すエンドポイント。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import { listMailboxes, renameCustomMailbox } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

// ボディには変更対象のパスと新しい名前を指定
const bodySchema = z.object({
  path: z.string().min(1),
  newName: z.string().min(1),
});

export default defineEventHandler(async event => {
  // ユーザーのメールアカウントを取得
  const account = await requireMailAccountForUser({ event });
  const body = await readBody(event);

  // バリデーション
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  // フォルダ名変更実行
  await renameCustomMailbox({
    account,
    path: parsed.data.path,
    newName: parsed.data.newName,
  });

  // 更新後リストを返す
  const mailboxes = await listMailboxes(account);

  return {
    ok: true,
    mailboxes,
  };
});
