import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);

  const account = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
    select: {
      id: true,
      label: true,
      emailAddress: true,
      username: true,
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    accounts: account ? [account] : [],
  };
});
