import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { organizationUpdateSchema } from '~~/shared/types/organization-update';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    const result = organizationUpdateSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { organizationId, data } = result.data;

    // 認証情報を全ヘッダーごと渡す
    const { headers } = event;
    const response = await auth.api.updateOrganization({
      body: {
        organizationId,
        data,
      },
      headers,
    });
    logger.debug({ response }, 'Organization update response');

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'ORGANIZATION_UPDATE',
      targetId: organizationId, // 更新された組織ID
      organizationId: organizationId,
      details: data,
    });

    return response;
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Organization update error');
      throw createError({
        statusCode: 400,
        message: '組織の更新に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
