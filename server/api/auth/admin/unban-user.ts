import { readBody, createError } from 'h3';
import { z } from 'zod';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

const UnbanUserBodySchema = z.object({
  userId: z.string().min(1),
});

type UnbanUserBody = z.infer<typeof UnbanUserBodySchema>;

export default defineEventHandler(async event => {
  let targetUserId: string | undefined;
  let payload: UnbanUserBody | undefined;

  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    const parsed = UnbanUserBodySchema.safeParse(body);

    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    payload = parsed.data;
    targetUserId = payload.userId;

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_UNBAN_REQUEST',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/unban-user',
      },
    });

    const data = await auth.api.unbanUser({
      body: {
        userId: payload.userId,
      },
      headers: event.headers,
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_UNBAN_SUCCESS',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/unban-user',
      },
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_UNBAN_FAILED',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/unban-user',
        errorMessage: msg,
        payload,
      },
    });

    logger.error(
      {
        event: 'auth_admin_unban_user_failed',
        targetUserId,
        errorMessage: msg,
      },
      'auth/admin/unban-user error'
    );

    throw createError({
      statusCode: 400,
      message: 'ユーザーのBAN解除に失敗しました',
    });
  }
});
