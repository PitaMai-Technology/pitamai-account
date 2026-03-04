import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  const session = await auth.api.getSession({ headers: event.headers });

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustSetPassword: true, email: true },
  });

  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  return {
    email: user.email,
    mustSetPassword: user.mustSetPassword,
  };
});
