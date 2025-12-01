import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';

// ```
// やりたい動作は「ロール判定が終わる前に `canAccessAdmin` が一瞬 `false` になるせいで、管理者でも F5 直後に `/apps/dashboard` へ飛ばされる」でした。今の修正で、ロール取得が完了してから初めてガードが走るので、admin が更新しても管理画面に留まります。

// - useOrgRoleChecks.ts
//   - `isRoleResolved` フラグを追加。`getActiveMemberRole` を呼ぶたびに `false → true` へ切り替えて「ロール判定済み」かどうかを公開。
//   - レスポンスの `role` 取り出しを型安全な `resolveRoleFromResponse` に統一（`any` を排除）。
//   - `return` に `isRoleResolved` を追加。

// - TheApp.vue
//   - `useOrgRole()` から `isRoleResolved` も受け取り、`watch` を `() => ({ canAccess, resolved })` で購読。
//   - `resolved` が `true` になるまでリダイレクト処理を実行しないようにし、権限が戻ったときは `hasRedirected` をリセット。

// これで管理者権限を持ったままブラウザ更新してもダッシュボードへ飛ばされず、組織切り替えで本当に権限を失った時だけトースト＋リダイレクトが起きます。

type OrgRole = 'member' | 'admin' | 'owner';

export function useOrgRole() {
  const activeOrganization = useActiveOrg();
  const roleRef = ref<OrgRole | null>(null);
  const isRoleResolved = ref(false);

  const resolveRoleFromResponse = (response: unknown): OrgRole | null => {
    if (!response || typeof response !== 'object') return null;

    const maybeData =
      'data' in response ? (response as { data?: unknown }).data : response;
    if (!maybeData || typeof maybeData !== 'object') return null;

    if ('role' in maybeData) {
      const value = (maybeData as { role?: unknown }).role;
      if (
        typeof value === 'string' &&
        ['member', 'admin', 'owner'].includes(value)
      ) {
        return value as OrgRole;
      }
    }

    return null;
  };

  // 権限喪失時リダイレクト
  //   挙動
  // 管理画面（/apps/admin/**）を見ている状態で、組織を「admin 権限のない組織」に切り替えた場合:
  // useOrgRole がロールを再取得
  // canAccessAdmin が true → false に変化
  // layouts/TheApp の watch が発火し、/apps/dashboard にリダイレクト
  // これにより、「管理権限がなくなった組織で管理画面に居続けない」ようになる。
  const fetchActiveMemberRole = async () => {
    isRoleResolved.value = false;
    try {
      const response = await authClient.organization.getActiveMember();
      roleRef.value = resolveRoleFromResponse(response);
    } catch {
      roleRef.value = null;
    } finally {
      isRoleResolved.value = true;
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
    isRoleResolved: readonly(isRoleResolved),
    fetchActiveMemberRole,
  };
}
