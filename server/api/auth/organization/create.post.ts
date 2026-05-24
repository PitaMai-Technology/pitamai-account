import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const result = organizationCreateSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    // auth.api.createOrganization に headers を渡すことで自動的に権限チェックが行われます
    const data = await auth.api.createOrganization({
      body: validated,
      headers: event.headers,
    });

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'ORGANIZATION_CREATE',
      targetId: data?.id,
      organizationId: data?.id,
      details: {
        name: validated.name,
        slug: validated.slug,
      },
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;
      
      logger.error(e, 'Organization creation error');
      throw createError({
        statusCode: 400,
        message: '組織の作成に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
