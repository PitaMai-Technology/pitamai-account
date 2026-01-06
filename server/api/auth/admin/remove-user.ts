import { readBody, createError } from 'h3';
import { logAuditWithSession } from '~~/server/utils/audit';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  let targetUserId: string | undefined;
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody<{ userId?: string }>(event);

    if (!body?.userId) {
      throw createError({ statusCode: 422, message: 'userId is required' });
    }

    targetUserId = body.userId;

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_REMOVE_REQUEST',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/remove-user',
      },
    });

    // better-auth の admin API をサーバー側から呼び出し
    const data = await auth.api.removeUser({
      body: {
        userId: targetUserId,
      },
      headers: event.headers,
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_REMOVE_SUCCESS',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/remove-user',
      },
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      await logAuditWithSession(event, {
        action: 'ADMIN_ACCOUNT_REMOVE_FAILED',
        targetId: targetUserId,
        details: {
          source: 'auth/admin/remove-user',
          errorMessage: e.message,
        },
      });

      logger.error(
        {
          event: 'auth_admin_remove_user_failed',
          targetUserId,
          errorMessage: e.message,
        },
        'auth/admin/remove-user error'
      );
      throw createError({
        statusCode: 400,
        message: 'ユーザー削除に失敗しました',
      });
    }

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_REMOVE_FAILED',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/remove-user',
        errorMessage: 'Unknown error',
      },
    });
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
