import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);

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
      email: user.email,
      name: user.name,
    },
    setting,
  };
});
