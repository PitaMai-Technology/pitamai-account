import { createError, getHeader, getRequestIP, type H3Event } from 'h3';
import { logger } from '~~/server/utils/logger';

type TurnstileVerifyResponse = {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileVerifyResponse> {
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
        timeout: 5000,
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

export async function assertTurnstile(event: H3Event): Promise<void> {
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
}
