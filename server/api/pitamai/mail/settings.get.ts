/**
 * server/api/pitamai/mail/settings.get.ts
 *
 * ログインユーザーのメールアカウント設定を返すエンドポイント。
 * 設定が存在するかどうかのフラグと、ユーザー情報を同梱して返却。
 */
import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  try {
    // 認証ユーザーを取得
    const user = await requireSessionUser(event);

    // DB から設定をロード
    const setting = await prisma.mailAccount.findUnique({
      where: {
        userId_emailAddress: { userId: user.id, emailAddress: user.email },
      },
      select: {
        id: true,
        username: true,
        imapHost: true,
        imapPort: true,
        imapSecure: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        updatedAt: true,
      },
    });

    // 結果を返却
    return {
      hasSetting: !!setting,
      user: {
        email: user.email,
        name: user.name,
      },
      setting,
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail settings get error');
      throw createError({
        statusCode: 400,
        message: 'メール設定の取得に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
