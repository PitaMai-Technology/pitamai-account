import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';

export const useOrg = () => {
  const router = useRouter();
  const activeOrg = useActiveOrg();

  const switchOrganization = async (organizationId: string) => {
    const nextOrganizationId = organizationId.trim() || null;

    try {
      if (!nextOrganizationId) {
        await authClient.organization.setActive({ organizationId: null });
        await router.push('/apps/dashboard');
        return true;
      }

      // Better Auth の listOrganizations をそのまま利用して一覧を取得
      const { data, error } = await authClient.organization.list({});

      if (error) {
        console.error('Organizations fetch error:', error);
        await router.push('/auth/login');
        return false;
      }

      if (!data || !Array.isArray(data)) {
        console.log('No organizations available');
        await router.push('/apps/dashboard');
        return false;
      }

      const targetOrg = data.find(org => org.id === nextOrganizationId);

      if (!targetOrg) {
        console.log('Organization not found:', nextOrganizationId);
        console.log('Available organizations:', data);
        await router.push('/apps/dashboard');
        return false;
      }

      // すでにアクティブな組織が選択されている場合は切り替えない
      if (activeOrg.value.data?.id !== nextOrganizationId) {
        await authClient.organization.setActive({
          organizationId: nextOrganizationId,
        });
      }

      return true;
    } catch (error) {
      console.error('Organization switch error:', error);
      await router.push('/apps/dashboard');
      return false;
    }
  };

  return {
    switchOrganization,
  };
};
