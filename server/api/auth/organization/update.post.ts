import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { logAuditWithSession } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';
import { organizationUpdateSchema } from '~~/shared/types/organization-update';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    const result = organizationUpdateSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    // auth.api.updateOrganization が内部で権限チェックを行います
    let data;

    try {
      data = await auth.api.updateOrganization({
        body: validated,
        headers: event.headers,
      });
    } catch (updateError) {
      await logAuditWithSession(event, {
        action: 'ORGANIZATION_UPDATE_FAILED',
        targetId: validated.organizationId,
        organizationId: validated.organizationId,
        details: validated.data,
      });
      throw updateError;
    }

    await logAuditWithSession(event, {
      action: 'ORGANIZATION_UPDATE',
      targetId: validated.organizationId ?? data?.id,
      organizationId: validated.organizationId ?? data?.id,
      details: validated.data,
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403))
        throw e;

      logger.error(e, 'Update organization error');
      throw createError({
        statusCode: 400,
        message: '組織の更新に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
