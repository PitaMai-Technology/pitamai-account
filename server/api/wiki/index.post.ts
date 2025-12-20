import { createError, readBody } from 'h3';
import prisma from '~~/lib/prisma';
import { wikiCreateSchema } from '~~/shared/types/wiki';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logAuditWithSession } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';
import {
  requireActiveOrganizationId,
  requireSessionUserId,
} from '~~/server/utils/wiki';

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureUniqueSlug(params: {
  organizationId: string;
  baseSlug: string;
}): Promise<string> {
  const base = params.baseSlug || 'page';

  const exists = await prisma.wiki.findFirst({
    where: { organizationId: params.organizationId, slug: base },
    select: { id: true },
  });
  if (!exists) return base;

  for (let i = 2; i <= 50; i++) {
    const candidate = `${base}-${i}`;
    const taken = await prisma.wiki.findFirst({
      where: { organizationId: params.organizationId, slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // ここまで埋まるのは稀なのでランダムサフィックス
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export default defineEventHandler(async event => {
  await assertActiveMemberRole(event, ['admins', 'owner']);

  const organizationId = await requireActiveOrganizationId(event);
  const userId = await requireSessionUserId(event);

  const body = await readBody(event);
  const parsed = wikiCreateSchema.safeParse(body);

  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  const baseSlug = parsed.data.slug
    ? parsed.data.slug
    : slugify(parsed.data.title);
  const slug = await ensureUniqueSlug({ organizationId, baseSlug });

  try {
    const wiki = await prisma.wiki.create({
      data: {
        organizationId,
        userId,
        title: parsed.data.title,
        slug,
        content: parsed.data.content ?? '',
        contentType: parsed.data.contentType ?? 'markdown',
      },
      select: { id: true, title: true, slug: true },
    });

    await logAuditWithSession(event, {
      action: 'WIKI_CREATE',
      targetId: wiki.id,
      organizationId,
      details: { title: wiki.title, slug: wiki.slug },
    });

    return { wiki };
  } catch (e) {
    logger.error(e, 'wiki create error');
    throw createError({ statusCode: 400, message: 'Wikiの作成に失敗しました' });
  }
});
