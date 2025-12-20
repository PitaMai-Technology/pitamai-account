import prisma from '~~/lib/prisma';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { requireActiveOrganizationId } from '~~/server/utils/wiki';

export default defineEventHandler(async event => {
  await assertActiveMemberRole(event, ['member', 'admins', 'owner']);
  const organizationId = await requireActiveOrganizationId(event);

  const wikis = await prisma.wiki.findMany({
    where: { organizationId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      slug: true,
      contentType: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return { wikis };
});
