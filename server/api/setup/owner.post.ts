import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  readBody,
} from 'h3';
import { generateId } from 'better-auth';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { recordAuditLog } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';

const setupOwnerSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().trim().min(1).optional(),
});

type TurnstileVerifyResponse = {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
) {
  const form = new URLSearchParams();
  form.set('secret', secretKey);
  form.set('response', token);
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  try {
    const response = await $fetch<TurnstileVerifyResponse>(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );

    if (!response.success) {
      logger.warn(
        {
          errorCodes: response['error-codes'],
        },
        'Turnstile verification failed'
      );
    }

    return response;
  } catch (error) {
    logger.error(
      {
        error,
        token: token.substring(0, 20) + '...',
      },
      'Turnstile API call failed'
    );
    throw createError({
      statusCode: 502,
      statusMessage: 'Turnstile verification upstream failed',
      data: {
        reason: 'TURNSTILE_UPSTREAM_ERROR',
      },
      cause: error,
    });
  }
}

export default defineEventHandler(async event => {
  try {
    const config = useRuntimeConfig();
    const secretKey = config.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      throw createError({
        statusCode: 503,
        message: 'Turnstile 設定が不足しています',
      });
    }

    const captchaToken = getHeader(event, 'x-captcha-response');
    if (!captchaToken) {
      throw createError({
        statusCode: 403,
        message: 'Captcha トークンが必要です',
      });
    }

    const remoteIp = getRequestIP(event, { xForwardedFor: true }) ?? undefined;
    const turnstile = await verifyTurnstileToken(
      captchaToken,
      secretKey,
      remoteIp
    );
    if (!turnstile.success) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Captcha verification failed',
        data: {
          reason: 'TURNSTILE_VERIFICATION_FAILED',
          errorCodes: turnstile['error-codes'] ?? [],
        },
      });
    }

    const existingOwnerCount = await prisma.user.count({
      where: {
        role: 'owner',
      },
    });

    if (existingOwnerCount > 0) {
      throw createError({
        statusCode: 409,
        message: 'セットアップは既に完了しています',
      });
    }

    const body = await readBody(event);
    const result = setupOwnerSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { email, name } = result.data;
    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      const updated = await prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          role: 'owner',
          name: name ?? existingUser.name,
          emailVerified: true,
        },
      });

      await recordAuditLog({
        userId: updated.id,
        action: 'SETUP_OWNER_UPDATE',
        targetId: updated.id,
        details: {
          email: updated.email,
          created: false,
        },
        event,
      });

      return {
        id: updated.id,
        email: updated.email,
        created: false,
        message: '既存ユーザーを owner に設定しました',
      };
    }

    const user = await prisma.user.create({
      data: {
        id: generateId(),
        email,
        name: name ?? email,
        role: 'owner',
        emailVerified: true,
      },
    });

    await recordAuditLog({
      userId: user.id,
      action: 'SETUP_OWNER_CREATE',
      targetId: user.id,
      details: {
        email: user.email,
        created: true,
      },
      event,
    });

    return {
      id: user.id,
      email: user.email,
      created: true,
    };
  } catch (e: unknown) {
    logger.error(e, 'setup owner error');
    if (
      e &&
      typeof e === 'object' &&
      'statusCode' in e &&
      typeof (e as { statusCode?: unknown }).statusCode === 'number'
    ) {
      throw e;
    }

    if (e instanceof Error) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Setup owner failed',
        data: {
          message: e.message,
        },
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
