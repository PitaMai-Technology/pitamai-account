import { authClient } from '~/composable/auth-client';

export default defineNuxtRouteMiddleware(async (to, _from) => {
  const { data: session } = await authClient.useSession(useFetch);

  if (session.value && to.path !== '/') {
    return navigateTo('/');
  }
});
