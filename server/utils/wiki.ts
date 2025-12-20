import { createError, type H3Event } from 'h3';
import { auth } from '~~/server/utils/auth';

export async function requireActiveOrganizationId(
  event: H3Event
): Promise<string> {
  const session = await auth.api.getSession({ headers: event.headers });

  const organizationId = session?.session?.activeOrganizationId;
  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: 'アクティブな組織が選択されていません。',
    });
  }

  return organizationId;
}

export async function requireSessionUserId(event: H3Event): Promise<string> {
  const session = await auth.api.getSession({ headers: event.headers });
  const userId = session?.user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: '認証をしてください。' });
  }

  return userId;
}
