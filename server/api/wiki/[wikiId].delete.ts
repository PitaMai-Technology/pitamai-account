import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logAuditWithSession } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';
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
    select: { id: true, title: true, slug: true },
  });

  if (!wiki) {
    throw createError({ statusCode: 404, message: 'Wiki not found' });
  }

  try {
    await prisma.wiki.delete({ where: { id: wikiId } });

    await logAuditWithSession(event, {
      action: 'WIKI_DELETE',
      targetId: wikiId,
      organizationId,
      details: { title: wiki.title, slug: wiki.slug },
    });

    return { success: true };
  } catch (e) {
    logger.error(e, 'wiki delete error');
    throw createError({ statusCode: 400, message: 'Wikiの削除に失敗しました' });
  }
});
