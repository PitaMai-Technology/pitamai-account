import { createError, defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';
import { logAuditWithSession } from '~~/server/utils/audit';

const sendVerificationSchema = z.object({
  callbackURL: z.string().min(1).optional(),
});

export default defineEventHandler(async event => {
  try {
    const session = await auth.api.getSession({ headers: event.headers });
    if (!session?.user?.email) {
      throw createError({
        statusCode: 401,
        message: '認証をしてください。',
      });
    }

    if (session.user.emailVerified) {
      return {
        status: true,
        message: 'このメールアドレスは既に認証済みです。',
      };
    }

    await logAuditWithSession(event, {
      action: 'SEND_VERIFICATION_EMAIL',
      details: {
        email: session.user.email,
        status: 'sent',
      },
    });

    const body = await readBody(event);
    const parsed = sendVerificationSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    await auth.api.sendVerificationEmail({
      body: {
        email: session.user.email,
        callbackURL: parsed.data.callbackURL ?? '/apps/users/settings',
      },
      headers: event.headers,
    });

    return {
      status: true,
      message: '認証メールを送信しました。受信トレイをご確認ください。',
    };
  } catch (e: unknown) {
    logger.error(e, 'send verification email error');
    if (e instanceof Error) {
      throw createError({
        statusCode: 400,
        message: e.message,
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
