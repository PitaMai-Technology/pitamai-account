import { authClient } from '~/composable/auth-client';

export default defineNuxtRouteMiddleware(async to => {
  if (!(to.path === '/apps' || to.path.startsWith('/apps/'))) {
    return;
  }

  if (to.path === '/apps/password-setup' || to.path === '/apps/error') {
    return;
  }

  try {
    const { data: session, error } = await authClient.getSession();
    if (error || !session?.user) {
      return;
    }

    if (!session || !session.user) {
      return;
    }

    const status = await $fetch<{ mustSetPassword: boolean }>(
      '/api/pitamai/password/setup-status'
    );

    if (status.mustSetPassword) {
      return navigateTo('/apps/password-setup');
    }
  } catch (error) {
    return navigateTo('/apps/error');
  }
});
