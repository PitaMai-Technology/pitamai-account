import { createError, type H3Event } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

export async function requireSessionUser(event: H3Event) {
  const session = await auth.api.getSession({ headers: event.headers });

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: '認証をしてください。',
    });
  }

  return session.user;
}

export async function requireSessionUserId(event: H3Event): Promise<string> {
  const user = await requireSessionUser(event);
  return user.id;
}

export async function requireMailAccountForUser(params: {
  event: H3Event;
  accountId?: string;
}) {
  const userId = await requireSessionUserId(params.event);

  const account = await prisma.mailAccount.findFirst({
    where: {
      ...(params.accountId ? { id: params.accountId } : {}),
      userId,
    },
    select: {
      id: true,
      userId: true,
      label: true,
      emailAddress: true,
      username: true,
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      encryptedPassword: true,
      encryptionIv: true,
      encryptionAuthTag: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!account) {
    throw createError({
      statusCode: 404,
      message: 'メールアカウントが見つかりません',
    });
  }

  return account;
}
