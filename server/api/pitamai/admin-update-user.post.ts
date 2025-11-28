// 管理者が任意のユーザー情報を更新できるサーバーエンドポイント
// 目的: サーバー側で権限チェックを行い、Prisma を使ってユーザー情報を更新する
import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { userUpdateSchema } from '~~/shared/types/user-update';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      console.error('Validation failed');
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, data } = parsed.data;

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
      throw createError({
        statusCode: 403,
        message: '管理者権限が必要です',
      });
    }

    // Prisma を使ってユーザー情報を更新（更新可能なフィールドのみコピー）
    const updateData: Record<string, unknown> = {};
    if (typeof data.name === 'string') updateData.name = data.name;
    if (typeof data.image === 'string') updateData.image = data.image;
    if (typeof data.email === 'string') updateData.email = data.email;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    return { success: true, user: updated };
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('admin-update-user error:', e.message);
      throw createError({
        statusCode: 400,
        message: 'ユーザー更新に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
