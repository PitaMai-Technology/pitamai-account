// 管理者が任意のユーザーのメールアドレスを即時に更新するエンドポイント（最小実装）
import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { userChangeEmailSchema } from '~~/shared/types/user-change-email';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userChangeEmailSchema.safeParse(body);
    if (!parsed.success) {
      console.error('Validation failed', parsed.error.format());
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, newEmail } = parsed.data;

    const headersObj =
      (event as unknown as { headers?: Record<string, string> }).headers ?? {};

    // 管理者権限チェック
    try {
      const roleRes = (await auth.api.getActiveMemberRole({
        headers: headersObj,
      })) as { role?: string } | undefined;
      const role = roleRes?.role;
      if (!role || (role !== 'admin' && role !== 'owner')) {
        throw createError({ statusCode: 403, message: '管理者権限が必要です' });
      }
    } catch {
      throw createError({ statusCode: 403, message: '管理者権限が必要です' });
    }

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
