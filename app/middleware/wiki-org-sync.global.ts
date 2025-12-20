import { authClient } from '~/composable/auth-client';

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<boolean> {
  if (predicate()) return Promise.resolve(true);

  return new Promise(resolve => {
    const startedAt = Date.now();
    const stop = watch(
      () => predicate(),
      ok => {
        if (ok) {
          stop();
          resolve(true);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          stop();
          resolve(false);
        }
      },
      { immediate: true }
    );
  });
}

export default defineNuxtRouteMiddleware(async to => {
  // authClient/useSession はクライアント前提
  if (import.meta.server) return;

  if (!to.path.startsWith('/apps/organization/wiki/')) return;

  const urlOrgId = to.params.id;
  if (typeof urlOrgId !== 'string' || !urlOrgId) return;

  const session = authClient.useSession();

  // Wait session hydration
  await waitFor(() => !session.value.isPending);

  const activeId = session.value.data?.session?.activeOrganizationId;

  // If active org is set, URL must follow it.
  if (activeId && activeId !== urlOrgId) {
    return navigateTo(
      {
        name: to.name as string | undefined,
        params: { ...to.params, id: activeId },
        query: to.query,
        hash: to.hash,
      },
      { replace: true }
    );
  }

  // If no active org yet, set it from URL.
  if (!activeId) {
    const { data, error } = await authClient.organization.list({});
    if (
      error ||
      !Array.isArray(data) ||
      !data.some(org => org.id === urlOrgId)
    ) {
      return navigateTo('/apps/dashboard', { replace: true });
    }

    await authClient.organization.setActive({ organizationId: urlOrgId });
    await waitFor(
      () => session.value.data?.session?.activeOrganizationId === urlOrgId
    );
  }
});
