import { authClient } from '~/composable/auth-client';

type NuxtAppWithOrganizationReloadWatcher = ReturnType<typeof useNuxtApp> & {
  _activeOrganizationReloadWatcherInstalled?: boolean;
};

export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) {
    return;
  }

  const router = useRouter();

  if (!router.currentRoute.value.path.startsWith('/apps')) {
    return;
  }

  const nuxtApp = useNuxtApp() as NuxtAppWithOrganizationReloadWatcher;

  if (nuxtApp._activeOrganizationReloadWatcherInstalled) {
    return;
  }

  nuxtApp._activeOrganizationReloadWatcherInstalled = true;

  const session = authClient.useSession();

  watch(
    () =>
      [
        session.value.data?.user?.id ?? null,
        session.value.data?.session?.activeOrganizationId ?? null,
      ] as const,
    ([userId, organizationId], previousValue) => {
      if (!previousValue) {
        return;
      }

      const [previousUserId, previousOrganizationId] = previousValue;

      if (!userId || userId !== previousUserId) {
        return;
      }

      if (organizationId === previousOrganizationId) {
        return;
      }

      const currentRoute = router.currentRoute.value;
      if (!currentRoute.path.startsWith('/apps')) {
        return;
      }

      reloadNuxtApp({
        path: currentRoute.fullPath,
        force: true,
      });
    },
    {
      immediate: true,
    }
  );
});
