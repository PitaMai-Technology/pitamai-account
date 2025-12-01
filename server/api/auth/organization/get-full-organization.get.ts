import { auth } from '~~/server/utils/auth';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  // owner / admin だけが組織のフル情報を取得できる
  await assertActiveMemberRole(event, ['admin', 'owner']);

  const { headers } = event;

  const organization = await auth.api.getFullOrganization({
    query: {},
    headers,
  });

  return organization;
});
