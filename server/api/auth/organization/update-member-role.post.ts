import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { UpdateMemberRoleSchema } from '~~/shared/types/member-update-role';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logAuditWithSession } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    const result = UpdateMemberRoleSchema.safeParse(body);

    if (!result.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { organizationId, memberId, role } = result.data;
    const { headers } = event;

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'MEMBER_ROLE_UPDATE',
      targetId: memberId, // ロールが更新されたメンバーID
      organizationId: organizationId,
      details: {
        newRole: role,
      },
    });

    return await auth.api.updateMemberRole({
      body: {
        organizationId,
        memberId,
        role,
      },
      headers,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Update member role error');
      throw createError({
        statusCode: 400,
        message: 'メンバーのロール更新に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
