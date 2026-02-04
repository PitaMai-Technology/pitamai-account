async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<boolean> {
  if (predicate()) return true;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs));
    if (predicate()) return true;
  }

  return false;
}

export default defineNuxtRouteMiddleware(async to => {
  if (!to.path.startsWith('/apps/organization/wiki/')) return;

  const urlOrgId = to.params.id;
  if (typeof urlOrgId !== 'string' || !urlOrgId) return;

  // SSR直アクセス時に activeOrganizationId が未設定だと /api/wiki が 400 になるため、
  // サーバー側でもURLの組織IDを active に同期する。
  if (import.meta.server) {
    const headers = useRequestHeaders(['cookie']);

    try {
      const session = await $fetch<{
        session?: { activeOrganizationId?: string | null };
        user?: unknown;
      } | null>('/api/auth/get-session', { headers });

      const activeId = session?.session?.activeOrganizationId ?? null;

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

      if (!activeId) {
        await $fetch('/api/auth/organization/set-active', {
          method: 'POST',
          headers,
          body: { organizationId: urlOrgId },
        });
      }
    } catch {
      return navigateTo('/apps/dashboard', { replace: true });
    }

    return;
  }

  const { authClient } = await import('~/composable/auth-client');

  const session = authClient.useSession();

  // セッションの読み込みが完了するまで待つ
  await waitFor(() => !session.value.isPending);

  const activeId = session.value.data?.session?.activeOrganizationId;

  // アクティブ組織が設定されている場合、URLはそれに従う必要がある。
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

  // アクティブ組織が未設定の場合、URLからアクティブ組織を設定する。
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
