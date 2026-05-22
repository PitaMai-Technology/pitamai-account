import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/shared/types/auth';

export default defineNuxtRouteMiddleware(async to => {
  // /apps/admin 配下だけ対象
  if (!to.path.startsWith('/apps/admin')) return;

  // /apps/admin/organization/** はアクティブ組織ベースのガードに任せる
  if (to.path.startsWith('/apps/admin/organization')) return;

  // Better Auth クライアントを使用してセッションを取得（SSR 対応）
  const { data: sessionData } = await authClient.getSession({
    fetchOptions: {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    },
  });

  const role = sessionData?.user?.role as OrgRole;
  if (!role) return navigateTo('/apps/error');

  const canAccess = authClient.admin.checkRolePermission({
    permissions: { user: ['list'] },
    role,
  });

  if (!canAccess) return navigateTo('/apps/error');
});
