import { createError, getQuery } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

const querySchema = z.object({
  userId: z.string().min(1, 'userIdは必須です'),
});

export default defineEventHandler(async event => {
  await assertActiveMemberRole(event, ['admins', 'owner']);

  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    throw createError({
      statusCode: 404,
      message: '対象ユーザーが見つかりません',
    });
  }

  const setting = await prisma.mailAccount.findUnique({
    where: {
      userId_emailAddress: { userId: user.id, emailAddress: user.email },
    },
    select: {
      id: true,
      username: true,
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      updatedAt: true,
    },
  });

  return {
    hasSetting: !!setting,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    setting,
  };
});
