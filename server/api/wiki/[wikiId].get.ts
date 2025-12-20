import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { requireActiveOrganizationId } from '~~/server/utils/wiki';

export default defineEventHandler(async event => {
  await assertActiveMemberRole(event, ['member', 'admins', 'owner']);
  const organizationId = await requireActiveOrganizationId(event);

  const wikiId = event.context.params?.wikiId;
  if (!wikiId) {
    throw createError({ statusCode: 400, message: 'wikiId is required' });
  }

  const wiki = await prisma.wiki.findFirst({
    where: { id: wikiId, organizationId },
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
      contentType: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!wiki) {
    throw createError({ statusCode: 404, message: 'Wiki not found' });
  }

  return { wiki };
});
