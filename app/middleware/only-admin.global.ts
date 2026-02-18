// app/middleware/only-admin-or-owner.global.ts
import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/server/utils/authorize';

export default defineNuxtRouteMiddleware(async to => {
  // /apps/admin 配下だけ対象
  if (!to.path.startsWith('/apps/admin')) return;

  // /apps/admin/organization/** はアクティブ組織ベースのガードに任せる
  if (to.path.startsWith('/apps/admin/organization')) return;

  // SSR 時はロール情報がまだ取れないので、クライアント側でのみチェック
  if (import.meta.server) return;

  // Better Auth クライアント API を使って現在のセッション／role を取得して判定
  const { data: sessionData } = await authClient.getSession();
  const role = sessionData?.user?.role as OrgRole;

  if (!role) return navigateTo('/apps/error');

  const canAccess = authClient.admin.checkRolePermission({
    permissions: { user: ['list'] },
    role,
  });

  if (!canAccess) return navigateTo('/apps/error');
});
