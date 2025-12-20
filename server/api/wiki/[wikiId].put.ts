import { createError, readBody } from 'h3';
import prisma from '~~/lib/prisma';
import { wikiUpdateSchema } from '~~/shared/types/wiki';
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

  const body = await readBody(event);
  const parsed = wikiUpdateSchema.safeParse(body);

  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  const before = await prisma.wiki.findFirst({
    where: { id: wikiId, organizationId },
    select: { id: true, title: true, slug: true, contentType: true },
  });

  if (!before) {
    throw createError({ statusCode: 404, message: 'Wiki not found' });
  }

  try {
    const updated = await prisma.wiki.update({
      where: { id: wikiId },
      data: {
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title }
          : {}),
        ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
        ...(parsed.data.content !== undefined
          ? { content: parsed.data.content }
          : {}),
        ...(parsed.data.contentType !== undefined
          ? { contentType: parsed.data.contentType }
          : {}),
      },
      select: { id: true, title: true, slug: true },
    });

    await logAuditWithSession(event, {
      action: 'WIKI_UPDATE',
      targetId: updated.id,
      organizationId,
      details: { before, after: updated },
    });

    return { wiki: updated };
  } catch (e) {
    logger.error(e, 'wiki update error');
    throw createError({ statusCode: 400, message: 'Wikiの更新に失敗しました' });
  }
});
