import { auth } from '~~/server/utils/auth';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  // owner / admin だけが組織のフル情報を取得できる
  await assertActiveMemberRole(event, ['admins', 'owner']);

  const { headers } = event;

  const organization = await auth.api.getFullOrganization({
    query: {},
    headers,
  });

  // 監査ログ記録
  await logAuditWithSession(event, {
    action: 'ORGANIZATION_GET_FULL',
    targetId: organization?.id,
  });

  return organization;
});
