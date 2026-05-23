import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const q = getQuery(event);
    const limit = Number(q.limit ?? 100);
    const offset = Number(q.offset ?? 0);

    // auth.api.listUsers に headers を渡すことで、
    // Better Auth が内部的に呼び出し元の権限（admin/owner等）を自動チェックします。
    const result = await auth.api.listUsers({
      query: { limit, offset },
      headers: event.headers,
    });

    const emails = result.users.map(u => u.email);
    const requests = await prisma.registrationRequest.findMany({
      where: { email: { in: emails } },
      select: { id: true, status: true, email: true },
    });

    const usersWithRequest = result.users.map(u => {
      const request = requests.find(r => r.email === u.email);
      return {
        ...u,
        registrationRequest: request ? { id: request.id, status: request.status } : null,
      };
    });

    return {
      ...result,
      users: usersWithRequest,
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      // 権限エラー(403)などはそのままスロー
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;

      logger.error(e, 'auth/admin/list-users error');
      throw createError({
        statusCode: 400,
        message: 'ユーザー一覧の取得に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
