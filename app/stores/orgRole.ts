import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';
import type { OrgRole } from '~~/server/utils/authorize';

/**
 * 組織ロール Pinia ストア
 *
 * シングルトンとして共有されるため、複数箇所で呼び出しても getActiveMember API の重複呼び出しを防ぎます。
 */
export const useOrgRoleStore = defineStore('orgRole', () => {
  const role = ref<OrgRole | null>(null);
  const isRoleResolved = ref(false);
  const globalRoleList: OrgRole[] = ['member', 'admins', 'owner'];

  const session = authClient.useSession();
  const activeOrg = useActiveOrg();

  const globalRole = computed(() => {
    const value = session.value?.data?.user?.role;
    return typeof value === 'string' ? value : null;
  });

  const resolveRoleFromResponse = (response: unknown): OrgRole | null => {
    if (!response || typeof response !== 'object') return null;

    const maybeData =
      'data' in response ? (response as { data?: unknown }).data : response;
    if (!maybeData || typeof maybeData !== 'object') return null;

    if ('role' in maybeData) {
      const value = (maybeData as { role?: unknown }).role;
      if (
        typeof value === 'string' &&
        globalRoleList.includes(value as OrgRole)
      ) {
        return value as OrgRole;
      }
    }

    return null;
  };

  const fetchActiveMemberRole = async () => {
    isRoleResolved.value = false;
    try {
      const response = await authClient.organization.getActiveMember();
      role.value = resolveRoleFromResponse(response);
    } catch {
      role.value = null;
    } finally {
      isRoleResolved.value = true;
    }
  };

  const canAccessAdmin = computed(() => {
    const canGlobal = globalRole.value
      ? authClient.admin.checkRolePermission({
          permissions: { user: ['list'] },
          role: globalRole.value as 'member' | 'admins' | 'owner',
        })
      : false;

    const canOrg = role.value
      ? authClient.organization.checkRolePermission({
          permissions: { project: ['admin-share'] },
          role: role.value,
        })
      : false;

    return canGlobal || canOrg;
  });

  const canAccessOAuthClients = computed(() => {
    return globalRole.value
      ? globalRoleList.includes(globalRole.value as OrgRole)
      : false;
  });

  if (import.meta.client) {
    fetchActiveMemberRole();

    // アクティブ組織の変更時にロールを再取得
    watch(
      () => activeOrg.value.data?.id,
      () => {
        fetchActiveMemberRole();
      }
    );
  }

  return {
    role: readonly(role),
    globalRole: readonly(globalRole),
    canAccessAdmin,
    canAccessOAuthClients,
    isRoleResolved: readonly(isRoleResolved),
    fetchActiveMemberRole,
  };
});
