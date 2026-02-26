/**
 * server/api/pitamai/mail/gpg-key.delete.ts
 *
 * ユーザーに紐づく GPG 鍵レコードを削除する API。
 * 主に鍵のリセットやアカウント削除時に使用される。
 */
import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  // セッションユーザーを確認
  const user = await requireSessionUser(event);

  // 関連する GPG 鍵レコードをすべて削除
  await prisma.userGpgKey.deleteMany({
    where: { userId: user.id },
  });

  return { ok: true };
});
