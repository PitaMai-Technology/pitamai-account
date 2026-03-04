export default defineNuxtRouteMiddleware(async to => {
  if (!to.path.startsWith('/apps')) {
    return;
  }

  if (to.path === '/apps/password-setup' || to.path === '/apps/error') {
    return;
  }

  try {
    const headers = import.meta.server
      ? useRequestHeaders(['cookie'])
      : undefined;

    const session = await $fetch('/api/auth/get-session', { headers }).catch(
      () => null
    );

    if (!session || !session.user) {
      return;
    }

    const status = await $fetch<{ mustSetPassword: boolean }>(
      '/api/pitamai/password/setup-status',
      { headers }
    );

    if (status.mustSetPassword) {
      return navigateTo('/apps/password-setup');
    }
  } catch {
    return navigateTo('/apps/error');
  }
});
