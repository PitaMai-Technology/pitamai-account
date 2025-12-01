// 管理者が任意のユーザーのメールアドレスを即時に更新するエンドポイント（最小実装）
import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { userChangeEmailSchema } from '~~/shared/types/user-change-email';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userChangeEmailSchema.safeParse(body);
    if (!parsed.success) {
      console.error('Validation failed', parsed.error.format());
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, newEmail } = parsed.data;

    await assertActiveMemberRole(event, ['admin', 'owner']);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
    });
    return { success: true, user: updated };
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('admin-change-email error:', e.message);
      throw createError({
        statusCode: 400,
        message: 'メール変更に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
