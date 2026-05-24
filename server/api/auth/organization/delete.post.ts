import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { recordAuditLog } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const session = await auth.api.getSession({ headers: event.headers });

    if (!session?.user?.id) {
      throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const organizationId =
      body.organizationId ?? body.id ?? body.organization_id;

    try {
      // auth.api.deleteOrganization が内部で権限チェック
      const result = await auth.api.deleteOrganization({
        body,
        headers: event.headers,
      });

      await recordAuditLog({
        userId: session.user.id,
        action: 'ORGANIZATION_DELETE',
        targetId: organizationId,
        details: { outcome: 'success' },
        event,
      });

      return result;
    } catch (e) {
      await recordAuditLog({
        userId: session.user.id,
        action: 'ORGANIZATION_DELETE_FAILED',
        organizationId,
        details: { outcome: 'error' },
        event,
      });
      throw e;
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403))
        throw e;

      logger.error(e, 'Organization deletion error');
      throw createError({
        statusCode: 400,
        message: '組織の削除に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
