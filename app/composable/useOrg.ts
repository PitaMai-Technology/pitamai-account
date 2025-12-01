import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';

export const useOrg = () => {
  const toast = useToast();
  const router = useRouter();
  const activeOrg = useActiveOrg();

  const switchOrganization = async (organizationId: string) => {
    if (!organizationId) {
      await router.push('/apps/dashboard');
      return false;
    }

    try {
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

      const targetOrg = data.find(org => org.id === organizationId);

      if (!targetOrg) {
        console.log('Organization not found:', organizationId);
        console.log('Available organizations:', data);
        await router.push('/apps/dashboard');
        return false;
      }

      if (activeOrg.value?.data?.id !== organizationId) {
        await authClient.organization.setActive({ organizationId });
      }

      toast.add({
        title: '現在の組織を自動的に切り替えました',
        description: `この組織に変更：${targetOrg.name}`,
        color: 'info',
      });

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
