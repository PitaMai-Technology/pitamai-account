import { createError } from 'h3';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const q = getQuery(event);
    const limit = Number(q.limit ?? 100);
    const offset = Number(q.offset ?? 0);

    const data = await auth.api.listUsers({
      query: { limit, offset },
      headers: event.headers,
    });

    return data ?? { users: [], total: 0 };
  } catch (e: unknown) {
    if (e instanceof Error) {
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
