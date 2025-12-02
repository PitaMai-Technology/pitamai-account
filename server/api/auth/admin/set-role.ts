import { readBody, createError } from 'h3';
import { auth } from '~~/server/utils/auth';

type Role = 'member' | 'admins' | 'owner';

type SetRoleBody = {
  userId?: string;
  role?: Role | Role[];
};

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody<SetRoleBody>(event);

    if (!body?.userId || !body.role) {
      throw createError({
        statusCode: 422,
        message: 'userId and role are required',
      });
    }

    const data = await auth.api.setRole({
      body: {
        userId: body.userId,
        role: body.role,
      },
      headers: event.headers,
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('auth/admin/set-role error:', e.message);
      throw createError({
        statusCode: 400,
        message: 'ロールの更新に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
