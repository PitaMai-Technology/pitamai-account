import { defineEventHandler, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  try {
    const session = await auth.api.getSession({
      headers: event.headers,
    });

    // 自分がオーナーであるメンバーシップを検索し、関連する組織情報を取得
    const memberships = await prisma.member.findMany({
      where: {
        userId: session?.user.id,
        role: 'owner',
      },
      include: {
        organization: true,
      },
    });

    // 組織情報の配列に変換して返す
    return memberships.map(m => m.organization);
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Owner organization list error:', e);
      throw createError({
        statusCode: 400,
        message: 'オーナー権限のある組織一覧の取得に失敗しました',
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
