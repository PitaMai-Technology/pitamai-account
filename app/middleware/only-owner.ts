import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/shared/types/auth';

export default defineNuxtRouteMiddleware(async to => {
  // Better Auth クライアントを使用してセッションを取得（SSR 対応）
  const { data, error } = await authClient.getSession({
    fetchOptions: {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    },
  });

  if (error || !data?.user?.role) return navigateTo('/apps/error');

  const role = data.user.role as OrgRole;
  const canAccess = authClient.admin.checkRolePermission({
    permissions: { project: ['owner'] },
    role,
  });

  if (!canAccess) return navigateTo('/apps/error');
});
