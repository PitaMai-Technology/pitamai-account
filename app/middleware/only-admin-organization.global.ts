import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/server/utils/authorize';

export default defineNuxtRouteMiddleware(async to => {
  if (!to.path.startsWith('/apps/admin/organization')) return;

  // SSR 時はロール情報がまだ取れないので、クライアント側でのみチェック
  if (import.meta.server) return;

  // グローバル admin/owner ロールを持つユーザーは常にアクセス可能
  const { data: sessionData } = await authClient.getSession();
  const globalRole = sessionData?.user?.role;

  if (globalRole === 'owner' || globalRole === 'admins') {
    return;
  }

  // グローバル権限がない場合、アクティブ組織での自分のロールを取得
  const { data, error } = await authClient.organization.getActiveMemberRole({});

  // ロールが取れない（組織に属していない or activeOrg 未設定など）は権限なし扱い
  if (error || !data?.role) {
    return navigateTo('/apps/error');
  }

  const canAccess = authClient.organization.checkRolePermission({
    permissions: {
      project: ['admin-share'],
    },
    role: data.role,
  });

  if (!canAccess) {
    return navigateTo('/apps/error');
  }
});
