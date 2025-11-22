import { createError } from 'h3';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  // APIルートのみを対象とする
  if (!event.path.startsWith('/api/')) {
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
