import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { userUpdateSchema } from '~~/shared/types/user-update';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      console.error('Validation failed');
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { userId, data } = parsed.data;
    await assertActiveMemberRole(event, ['admins', 'owner']);

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
