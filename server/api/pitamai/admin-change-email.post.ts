import { readBody, createError } from 'h3';
import { userChangeEmailSchema } from '~~/shared/types/user-change-email';
import { logger } from '~~/server/utils/logger';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userChangeEmailSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message }, 'Validation failed');
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, newEmail } = parsed.data;

    // Better Auth の adminUpdateUser を使用してメールアドレスを更新
    // これにより管理権限のチェックが自動的に行われます
    const updated = await auth.api.adminUpdateUser({
      body: {
        userId,
        data: {
          email: newEmail,
        },
      },
      headers: event.headers,
    });

    return { success: true, user: updated };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;

      logger.error(e, 'admin-change-email error');
      throw createError({
        statusCode: 400,
        message: 'メール変更に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
