import { createError } from 'h3';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  if (
    !event.path.startsWith('/api/pitamai/') ||
    event.path.startsWith('/api/auth/organization')
  ) {
    return;
  }

  const session = await auth.api.getSession({
    headers: event.headers,
  });

  if (!session) {
    throw createError({
      statusCode: 401,
      message: '認証をしてください。',
    });
  }
});
