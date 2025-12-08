import { readBody, createError } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { generateId } from 'better-auth';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';

const preRegisterSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().min(1).optional(),
  role: z.enum(['member', 'admins', 'owner']).optional(),
});

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    const result = preRegisterSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { email, name, role } = result.data;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      // 既に同じメールアドレスのユーザーが存在する場合は、新規作成しない
      return {
        id: existing.id,
        email: existing.email,
        created: false,
        message: 'このメールアドレスは既に存在します',
      };
    }

    const user = await prisma.user.create({
      data: {
        id: generateId(),
        email,
        name: name ?? email,
        // ユーザー全体のロールを事前付与（デフォルトは member）
        role: role ?? 'member',
      },
    });

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'USER_PRE_REGISTER_SUCCESS',
      targetId: user.id,
    });

    return {
      id: user.id,
      email: user.email,
      created: true,
    };
  } catch (e: unknown) {
    await logAuditWithSession(event, {
      action: 'USER_PRE_REGISTER_FAILURE',
    });
    if (e instanceof Error) {
      logger.error(e, 'Pre-register user error');
      throw createError({
        statusCode: 400,
        message: '事前登録に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
