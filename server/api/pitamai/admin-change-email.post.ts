// 管理者が任意のユーザーのメールアドレスを即時に更新するエンドポイント（最小実装）
import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { userChangeEmailSchema } from '~~/shared/types/user-change-email';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userChangeEmailSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message }, 'Validation failed');
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, newEmail } = parsed.data;

    await assertActiveMemberRole(event, ['admins', 'owner']);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
    });
    return { success: true, user: updated };
  } catch (e: unknown) {
    if (e instanceof Error) {
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
