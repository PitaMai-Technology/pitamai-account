import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);

  await prisma.userGpgKey.deleteMany({
    where: { userId: user.id },
  });

  return { ok: true };
});
