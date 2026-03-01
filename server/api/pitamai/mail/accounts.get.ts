/**
 * server/api/pitamai/mail/accounts.get.ts
 *
 * ログインユーザーのメールアカウント一覧を返す (現状1件まで) エンドポイント。
 * アカウントはユーザー単位で1つのみ想定しているため、配列を返却する。
 */
import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  try {
    // セッションユーザーを取得
    const user = await requireSessionUser(event);

    // ユーザーに紐づくメールアカウントを検索
    const account = await prisma.mailAccount.findFirst({
      where: { userId: user.id },
      select: {
        id: true,
        label: true,
        emailAddress: true,
        username: true,
        imapHost: true,
        imapPort: true,
        imapSecure: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 配列形式で返却
    return {
      accounts: account ? [account] : [],
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail accounts list error');
      throw createError({
        statusCode: 400,
        message: 'メールアカウント一覧の取得に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
