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

    const data = await auth.api.listUserSessions({
      body: { userId: body.userId },
      headers: event.headers,
    });

    await logAuditWithSession(event, {
      action: 'ADMIN_ACCOUNT_SESSIONS_LIST',
      targetId: body.userId,
      details: {
        source: 'auth/admin/list-user-sessions',
      },
    });

    return data ?? { sessions: [] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    if (body?.userId) {
      await logAuditWithSession(event, {
        action: 'ADMIN_ACCOUNT_SESSIONS_LIST_FAILED',
        targetId: body.userId,
        details: {
          source: 'auth/admin/list-user-sessions',
          errorMessage: msg,
        },
      });
    }

    logger.error({ err: e }, 'auth/admin/list-user-sessions error');

    throw createError({
      statusCode: 400,
      message: 'セッション一覧の取得に失敗しました',
    });
  }
});
