import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/server/utils/authorize';

export default defineNuxtRouteMiddleware(async to => {
  // SSR 時はロール情報がまだ取れないので、クライアント側でのみチェック
  if (import.meta.server) return;

  // グローバル user.role を使って owner 権限を判定
  const { data, error } = await authClient.getSession();
  if (error || !data?.user?.role) return navigateTo('/apps/error');

  const role = data.user.role as OrgRole;
  const canAccess = authClient.admin.checkRolePermission({
    permissions: { project: ['owner'] },
    role,
  });

  if (!canAccess) return navigateTo('/apps/error');
});
