import { readBody, createError } from 'h3';
import { auth } from '~~/server/utils/auth';
import { logAuditWithSession } from '~~/server/utils/audit';

type Role = 'member' | 'admins' | 'owner';

type SetRoleBody = {
  userId?: string;
  role?: Role | Role[];
};

export default defineEventHandler(async event => {
  try {
    const body = await readBody<SetRoleBody>(event);

    if (!body?.userId || !body.role) {
      throw createError({
        statusCode: 422,
        message: 'userId and role are required',
      });
    }

    // auth.api.setRole に headers を渡すことで権限チェックが行われます
    const data = await auth.api.setRole({
      body: {
        userId: body.userId,
        role: body.role,
      },
      headers: event.headers,
    });

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_ROLE_SET',
      targetId: body.userId,
      details: {
        newRole: body.role,
      },
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;
      
      console.error('auth/admin/set-role error:', e.message);
      throw createError({
        statusCode: 400,
        message: 'ロールの更新に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
