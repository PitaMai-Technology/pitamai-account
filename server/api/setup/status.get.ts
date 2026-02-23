import { defineEventHandler } from 'h3';
import prisma from '~~/lib/prisma';

export default defineEventHandler(async () => {
  const ownerCount = await prisma.user.count({
    where: {
      role: 'owner',
    },
  });

  return {
    isSetupCompleted: ownerCount > 0,
    ownerCount,
  };
});
