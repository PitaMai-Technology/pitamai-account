import { defineEventHandler, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const session = await auth.api.getSession({ headers: event.headers });

    // 自分が admin または owner であるメンバーシップを検索し、関連する組織情報を取得
    const memberships = await prisma.member.findMany({
      where: {
        userId: session?.user.id,
        role: { in: ['admins', 'owner'] },
      },
      include: {
        organization: true,
      },
    });

    // 組織情報の配列に変換して返す
    return memberships.map(m => m.organization);
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Admin+Owner organization list error');
      throw createError({
        statusCode: 400,
        message: '管理者またはオーナー権限のある組織一覧の取得に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
