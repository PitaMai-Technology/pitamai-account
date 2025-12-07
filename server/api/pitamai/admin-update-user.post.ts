import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { userUpdateSchema } from '~~/shared/types/user-update';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn('Validation failed');
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
