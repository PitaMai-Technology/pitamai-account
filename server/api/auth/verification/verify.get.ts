import { createError, defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

const verifyQuerySchema = z.object({
  token: z.string().min(1),
  callbackURL: z.string().min(1).optional(),
});

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const parsed = verifyQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const data = await auth.api.verifyEmail({
      query: {
        token: parsed.data.token,
        callbackURL: parsed.data.callbackURL,
      },
      headers: event.headers,
    });

    return data;
  } catch (e: unknown) {
    logger.error(e, 'verify email error');
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
