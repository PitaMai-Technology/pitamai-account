import { readBody, createError } from 'h3';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody<{ userId?: string }>(event);

    if (!body?.userId) {
      throw createError({ statusCode: 422, message: 'userId is required' });
    }

    // better-auth の admin API をサーバー側から呼び出し
    const data = await auth.api.removeUser({
      body: {
        userId: body.userId,
      },
      headers: event.headers,
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('auth/admin/remove-user error:', e.message);
      throw createError({
        statusCode: 400,
        message: 'ユーザー削除に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
