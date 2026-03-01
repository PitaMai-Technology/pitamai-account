/**
 * server/api/pitamai/mail/gpg-key.delete.ts
 *
 * ユーザーに紐づく GPG 鍵レコードを削除する API。
 * 主に鍵のリセットやアカウント削除時に使用される。
 */
import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  try {
    // セッションユーザーを確認
    const user = await requireSessionUser(event);

    // 関連する GPG 鍵レコードをすべて削除
    await prisma.userGpgKey.deleteMany({
      where: { userId: user.id },
    });

    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'GPG key delete error');
      throw createError({
        statusCode: 400,
        message: 'GPG鍵削除に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
