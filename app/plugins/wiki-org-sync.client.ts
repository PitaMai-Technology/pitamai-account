import { authClient } from '~/composable/auth-client';

export default defineNuxtPlugin(() => {
  const route = useRoute();
  const router = useRouter();
  const session = authClient.useSession();

  watch(
    () => ({
      path: route.path,
      urlOrgId: route.params.id,
      activeId: session.value.data?.session?.activeOrganizationId,
      pending: session.value.isPending,
    }),
    async ({ path, urlOrgId, activeId, pending }) => {
      if (pending) return;
      if (!activeId) return;
      if (!path.startsWith('/apps/organization/wiki/')) return;
      if (typeof urlOrgId !== 'string') return;
      if (urlOrgId === activeId) return;

      await router.replace({
        name: route.name as string | undefined,
        params: { ...route.params, id: activeId },
        query: route.query,
        hash: route.hash,
      });
    },
    { immediate: true }
  );
});
