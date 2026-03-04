import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { logAuditWithSession } from '~~/server/utils/audit';

export default defineEventHandler(async event => {
  const session = await auth.api.getSession({ headers: event.headers });

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { mustSetPassword: false },
    select: { id: true, email: true },
  });

  await logAuditWithSession(event, {
    action: 'USER_INITIAL_PASSWORD_SETUP_COMPLETE',
    targetId: user.id,
    details: {
      email: user.email,
    },
  });

  return { ok: true };
});
