import { readBody, createError } from 'h3';
import { userUpdateSchema } from '~~/shared/types/user-update';
import { logger } from '~~/server/utils/logger';
import { auth } from '~~/server/utils/auth';
import { logAuditWithSession } from '~~/server/utils/audit';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn('Validation failed');
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, data } = parsed.data;

    // Better Auth の adminUpdateUser を使用することで権限チェックを標準化
    const result = await auth.api.adminUpdateUser({
      body: {
        userId,
        data,
      },
      headers: event.headers,
    });

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'USER_UPDATE_SUCCESS',
      targetId: userId,
    });

    return { success: true, user: result };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403))
        throw e;

      logger.error(e, 'admin-update-user error');
      throw createError({
        statusCode: 400,
        message: 'ユーザー更新に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
