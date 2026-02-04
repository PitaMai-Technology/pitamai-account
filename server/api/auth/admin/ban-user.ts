import { readBody, createError } from 'h3';
import { z } from 'zod';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

const BanUserBodySchema = z.object({
  userId: z.string().min(1),
  banReason: z.string().min(1).optional(),
  banExpiresIn: z.number().int().positive().optional(),
});

type BanUserBody = z.infer<typeof BanUserBodySchema>;

export default defineEventHandler(async event => {
  let targetUserId: string | undefined;
  let payload: BanUserBody | undefined;

  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    const parsed = BanUserBodySchema.safeParse(body);

    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    payload = parsed.data;
    targetUserId = payload.userId;

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_BAN_REQUEST',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/ban-user',
        banReason: payload.banReason,
        banExpiresIn: payload.banExpiresIn,
      },
    });

    const data = await auth.api.banUser({
      body: {
        userId: payload.userId,
        banReason: payload.banReason,
        banExpiresIn: payload.banExpiresIn,
      },
      headers: event.headers,
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_BAN_SUCCESS',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/ban-user',
      },
    });

    return data ?? { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_BAN_FAILED',
      targetId: targetUserId,
      details: {
        source: 'auth/admin/ban-user',
        errorMessage: msg,
        payload,
      },
    });

    logger.error(
      {
        event: 'auth_admin_ban_user_failed',
        targetUserId,
        errorMessage: msg,
      },
      'auth/admin/ban-user error'
    );

    throw createError({
      statusCode: 400,
      message: 'ユーザーのBANに失敗しました',
    });
  }
});
