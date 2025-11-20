import { authClient } from '~/composable/auth-client';

type OrgRole = 'member' | 'admin' | 'owner';

export function useOrgRole() {
  const activeOrganization = authClient.useActiveOrganization();
  const roleRef = ref<OrgRole | null>(null);

  // 権限喪失時リダイレクト
  //   挙動
  // 管理画面（/apps/admin/**）を見ている状態で、組織を「admin 権限のない組織」に切り替えた場合:
  // useOrgRole がロールを再取得
  // canAccessAdmin が true → false に変化
  // layouts/TheApp の watch が発火し、/apps/dashboard にリダイレクト
  // これにより、「管理権限がなくなった組織で管理画面に居続けない」ようになる。
  const fetchActiveMemberRole = async () => {
    try {
      const response = await authClient.organization.getActiveMemberRole({});
      const payload: any = (response as any)?.data ?? response;
      if (payload && typeof payload.role === 'string') {
        if (['member', 'admin', 'owner'].includes(payload.role)) {
          roleRef.value = payload.role as OrgRole;
        } else {
          roleRef.value = null;
        }
      } else {
        roleRef.value = null;
      }
    } catch {
      roleRef.value = null;
    }
  };

  if (import.meta.client) {
    fetchActiveMemberRole();

    // アクティブ組織変更時に再取得
    watch(
      () => activeOrganization.value.data?.id,
      () => {
        fetchActiveMemberRole();
      }
    );
  }

  // ナビゲーションでの管理メニュー制御
  // サイドナビでは、useOrgRoleChecks の canAccessAdmin を使って「管理者のみ」セクションの表示/非表示を制御する。

  const canAccessAdmin = computed(() => {
    if (!roleRef.value) return false;
    return authClient.organization.checkRolePermission({
      permissions: {
        project: ['share'],
      },
      role: roleRef.value,
    });
  });

  return {
    role: readonly(roleRef),
    canAccessAdmin,
    fetchActiveMemberRole,
  };
}
