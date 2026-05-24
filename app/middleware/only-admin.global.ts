import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/shared/types/auth';
import { recordAuditLog } from '~~/server/utils/audit';

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

  // runtime validation for OrgRole to avoid unsafe assertions
  const possibleRole = sessionData?.user?.role;

  const isOrgRole = (v: unknown): v is OrgRole => {
    return v === 'member' || v === 'admins' || v === 'owner';
  };

  if (!isOrgRole(possibleRole)) {
    // invalid or missing role — fail closed
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[only-admin] invalid session role:', possibleRole);
    }

    // Record audit on server for investigation
    if (import.meta.server) {
      try {
        const event = useRequestEvent();
        await recordAuditLog({
          action: 'MIDDLEWARE_INVALID_ROLE',
          details: { role: possibleRole },
          event,
        });
      } catch (e) {
        // don't block the response if audit fails
        // eslint-disable-next-line no-console
        console.error('Failed to record audit log (invalid role):', e);
      }
    }

    return navigateTo('/apps/error');
  }

  const role: OrgRole = possibleRole;

  const canAccess = authClient.admin.checkRolePermission({
    permissions: { user: ['list'] },
    role,
  });

  if (!canAccess) {
    // Record audit on server for denied access attempts
    if (import.meta.server) {
      try {
        const event = useRequestEvent();
        await recordAuditLog({
          userId: sessionData?.user?.id,
          action: 'ADMIN_GUARD_ACCESS_DENIED',
          details: { required: { user: ['list'] }, role },
          event,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to record audit log (access denied):', e);
      }
    }

    return navigateTo('/apps/error');
  }
});
