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
  let body: Body | undefined;

  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const raw = await readBody(event);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    body = parsed.data;

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_REQUEST',
      targetId: body.userId,
      details: {
        source: 'auth/admin/revoke-user-sessions',
      },
    });

    const data = await auth.api.revokeUserSessions({
      body: { userId: body.userId },
      headers: event.headers,
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_SUCCESS',
      targetId: body.userId,
      details: {
        source: 'auth/admin/revoke-user-sessions',
      },
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    if (body?.userId) {
      await logAuditWithSession(event, {
        action: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_FAILED',
        targetId: body.userId,
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
