import { authClient } from '~/composable/auth-client';

/**
 * authClient.useActiveOrganization() の代替フック。
 *
 * オリジナルの useActiveOrganization() は get-full-organization エンドポイントを叩くため、
 * 権限のないメンバーが使用するとエラーになる場合があります。
 *
 * このフックは useSession (activeOrganizationId) と useListOrganizations を組み合わせて
 * クライアントサイドでアクティブな組織を特定するため、追加の権限を必要としません。
 */
export const useActiveOrg = () => {
  const session = authClient.useSession();
  const organizations = authClient.useListOrganizations();

  return computed(() => {
    const activeId = session?.value.data?.session?.activeOrganizationId;
    const orgs = organizations.value.data;

    const data =
      activeId && orgs ? orgs.find(org => org.id === activeId) || null : null;

    return {
      data,
      isPending: session.value.isPending || organizations.value.isPending,
      error: session.value.error || organizations.value.error,
    };
  });
};
