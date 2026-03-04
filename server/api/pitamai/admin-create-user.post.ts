import { createError, readBody } from 'h3';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';
import { logAuditWithSession } from '~~/server/utils/audit';

const createUserSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().min(1).optional(),
  role: z.enum(['member', 'admins', 'owner']).optional(),
});

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { email, name, role } = parsed.data;
    const temporaryPassword = `${randomUUID()}!aA1`;

    const createdFromAuth = (await auth.api.createUser({
      body: {
        email,
        name: name ?? email,
        role: role ?? 'member',
        password: temporaryPassword,
      },
      headers: event.headers,
    })) as { user?: { id?: string } };

    const createdUserId = createdFromAuth.user?.id;
    if (!createdUserId) {
      throw createError({
        statusCode: 500,
        message: 'ユーザー作成結果の取得に失敗しました',
      });
    }

    const createdUser = await prisma.user.update({
      where: { id: createdUserId },
      data: { mustSetPassword: true },
      select: {
        id: true,
        email: true,
      },
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_CREATE_USER_SUCCESS',
      targetId: createdUser.id,
      details: {
        email: createdUser.email,
      },
    });

    return {
      created: true,
      user: createdUser,
    };
  } catch (e: unknown) {
    await logAuditWithSession(event, {
      action: 'ADMIN_CREATE_USER_FAILURE',
    });

    if (e instanceof Error) {
      logger.error(e, 'admin-create-user error');
      throw createError({
        statusCode: 400,
        message: 'ユーザー作成に失敗しました',
        cause: e,
      });
    }

    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
