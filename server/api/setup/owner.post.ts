import { createError, defineEventHandler, getHeader, readBody } from 'h3';
import { generateId } from 'better-auth';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { logAuditWithSession } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';

const setupOwnerSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().trim().min(1).optional(),
});

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

async function verifyTurnstileToken(token: string, secretKey: string) {
  const form = new URLSearchParams();
  form.set('secret', secretKey);
  form.set('response', token);

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

  return response.success;
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

    const captchaVerified = await verifyTurnstileToken(captchaToken, secretKey);
    if (!captchaVerified) {
      throw createError({
        statusCode: 403,
        message: 'Captcha 検証に失敗しました',
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

      await logAuditWithSession(event, {
        action: 'SETUP_OWNER_UPDATE',
        targetId: updated.id,
        details: {
          email: updated.email,
          created: false,
        },
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

    await logAuditWithSession(event, {
      action: 'SETUP_OWNER_CREATE',
      targetId: user.id,
      details: {
        email: user.email,
        created: true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      created: true,
    };
  } catch (e: unknown) {
    logger.error(e, 'setup owner error');
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
