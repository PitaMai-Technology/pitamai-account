import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';
import { logAuditWithSession } from '~~/server/utils/audit';
import { sendEmail } from '~~/server/utils/email';

const createUserSchema = z.object({
  email: z.string().email('メールアドレスの形式が正しくありません'),
  name: z.string().min(1).optional(),
  role: z.enum(['member', 'admins', 'owner']).optional(),
  sendEmail: z.boolean().optional(),
});

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { email, name, role, sendEmail: shouldSendEmail } = parsed.data;
    const temporaryPassword = `${globalThis.crypto.randomUUID()}!aA1`;

    // auth.api.createUser に headers を渡すことで自動的に権限チェックが行われます
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

    const createdUser = await prisma.user.findUniqueOrThrow({
      where: { id: createdUserId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    try {
      await logAuditWithSession(event, {
        action: 'ADMIN_CREATE_USER_SUCCESS',
        targetId: createdUser.id,
        details: {
          email: createdUser.email,
        },
      });
    } catch (auditErr) {
      logger.warn(
        { err: auditErr },
        'admin-create-user success audit log failed'
      );
    }

    if (shouldSendEmail) {
      const config = useRuntimeConfig();
      const loginUrl = `${config.public.BETTER_AUTH_URL}/login`;
      try {
        await sendEmail({
          to: createdUser.email,
          subject: '【ピタマイ・テクノロジー】構成員アカウント作成のお知らせ',
          text: `${createdUser.name} さん\n\n構成員アカウントが作成されました。\n\n以下のログインページより、メールアドレスを入力してログインしてください。\n\nログインURL:\n${loginUrl}`,
        });
      } catch (emailError) {
        logger.error(emailError, 'Failed to send welcome email to manually created user');
      }
    }

    return {
      created: true,
      user: createdUser,
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;
    }

    try {
      await logAuditWithSession(event, {
        action: 'ADMIN_CREATE_USER_FAILURE',
      });
    } catch (auditErr) {
      logger.warn(
        { err: auditErr },
        'admin-create-user failure audit log failed'
      );
    }

    if (e instanceof Error) {
      logger.error(e, 'admin-create-user error');
    }

    if (e && typeof e === 'object' && 'statusCode' in e) {
      throw e;
    }

    throw createError({
      statusCode: 500,
      message: 'ユーザー作成に失敗しました',
      cause: e instanceof Error ? e : undefined,
    });
  }
});
