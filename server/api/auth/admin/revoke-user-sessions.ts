import { readBody, createError } from 'h3';
import { z } from 'zod';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';
import { logAuditWithSession } from '~~/server/utils/audit';

const BodySchema = z.object({
  userId: z.string().min(1),
});

type Body = z.infer<typeof BodySchema>;

export default defineEventHandler(async event => {
  let validatedBody: Body | undefined;

  try {
    const body = await readBody(event);
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    validatedBody = parsed.data;

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_REQUEST',
      targetId: validatedBody.userId,
      details: {
        source: 'auth/admin/revoke-user-sessions',
      },
    });

    const data = await auth.api.revokeUserSessions({
      body: { userId: validatedBody.userId },
      headers: event.headers,
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_SUCCESS',
      targetId: validatedBody.userId,
      details: {
        source: 'auth/admin/revoke-user-sessions',
      },
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    if (validatedBody?.userId) {
      await logAuditWithSession(event, {
        action: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_FAILED',
        targetId: validatedBody.userId,
        details: {
          source: 'auth/admin/revoke-user-sessions',
          errorMessage: msg,
        },
      });
    }

    logger.error({ err: e }, 'auth/admin/revoke-user-sessions error');

    throw createError({
      statusCode: 400,
      message: 'セッションの削除に失敗しました',
    });
  }
});
