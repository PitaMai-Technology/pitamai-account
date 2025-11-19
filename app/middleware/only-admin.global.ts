// app/middleware/only-admin-or-owner.global.ts
import { authClient } from '~/composable/auth-client';

export default defineNuxtRouteMiddleware(async to => {
  // /apps/admin 配下だけ対象
  if (!to.path.startsWith('/apps/admin')) return;

  // SSR 時はロール情報がまだ取れないので、クライアント側でのみチェック
  if (import.meta.server) return;

  // アクティブ組織での自分のロールを取得
  const { data, error } = await authClient.organization.getActiveMemberRole({});

  // ロールが取れない（組織に属していない or activeOrg 未設定など）は権限なし扱い
  if (error || !data?.role) {
    return navigateTo('/apps/error');
  }

  const canAccess = authClient.organization.checkRolePermission({
    permissions: {
      project: ['share'],
    },
    role: data.role as 'member' | 'admin' | 'owner',
  });

  if (!canAccess) {
    return navigateTo('/apps/error');
  }
});
