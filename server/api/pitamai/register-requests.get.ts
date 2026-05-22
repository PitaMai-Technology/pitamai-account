import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  const session = await auth.api.getSession({ headers: event.headers });
  const role = session?.user?.role;

  if (role !== 'owner' && role !== 'admins') {
    throw createError({
      statusCode: 403,
      message: '権限がありません',
    });
  }

  const requests = await prisma.registrationRequest.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return { requests };
});
