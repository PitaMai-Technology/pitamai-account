import { authClient } from '~/composable/auth-client';

export const useOrg = () => {
    const toast = useToast();
    const router = useRouter();

    const switchOrganization = async (organizationId: string) => {
        if (!organizationId) {
            await router.push('/apps/dashboard');
            return false;
        }

        try {

            // 組織リストを取得
            const organizationsResponse = await authClient.organization.list();

            // エラーチェック
            if (organizationsResponse.error) {
                console.error('Organizations fetch error:', organizationsResponse.error);
                await router.push('/auth/login');
                return false;
            }

            // data プロパティから組織リストを取得
            const organizations = organizationsResponse?.data;

            if (!organizations || !Array.isArray(organizations)) {
                console.log('No organizations available');
                await router.push('/apps/dashboard');
                return false;
            }

            // 指定されたIDの組織が存在するか確認
            const targetOrg = organizations.find(org => org.id === organizationId);

            if (!targetOrg) {
                console.log('Organization not found:', organizationId);
                console.log('Available organizations:', organizations);
                await router.push('/apps/dashboard');
                return false;
            }

            // アクティブな組織を取得
            const activeOrg = authClient.useActiveOrganization();

            // 異なる組織の場合は切り替え
            if (activeOrg.value?.data?.id !== organizationId) {
                await authClient.organization.setActive({ organizationId });
            }

            toast.add({ title: '現在の組織を自動的に切り替えました', description: `この組織に変更：${targetOrg.name}`, color: 'info' });

            return true;
        } catch (error) {
            console.error('Organization switch error:', error);
            await router.push('/apps/dashboard');
            return false;
        }
    };

    return {
        switchOrganization
    };
};