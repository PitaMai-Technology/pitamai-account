import { authClient } from '~/composable/auth-client';

export default defineNuxtRouteMiddleware(async to => {
  if (!to.path.startsWith('/apps/admin/organization')) return;

  const fetchOptions = {
    headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
  };

  // グローバル admin/owner ロールを持つユーザーは常にアクセス可能
  const { data: sessionData } = await authClient.getSession({ fetchOptions });
  const globalRole = sessionData?.user?.role;

  if (globalRole === 'owner' || globalRole === 'admins') {
    return;
  }

  // グローバル権限がない場合、アクティブ組織での自分のロールを取得
  const { data, error } = await authClient.organization.getActiveMemberRole({
    fetchOptions,
  });

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
