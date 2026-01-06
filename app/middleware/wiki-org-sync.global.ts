import { authClient } from '~/composable/auth-client';

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
  // authClient/useSession はクライアント前提
  if (import.meta.server) return;

  if (!to.path.startsWith('/apps/organization/wiki/')) return;

  const urlOrgId = to.params.id;
  if (typeof urlOrgId !== 'string' || !urlOrgId) return;

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
