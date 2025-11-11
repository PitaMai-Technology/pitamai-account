import { authClient } from '~/composable/auth-client';

export default defineNuxtRouteMiddleware((to) => {
  // ログインページは認証チェックをスキップ
  if (to.path === '/') {
    return;
  }

  const session = authClient.useSession(useFetch);

  if (!session) {
    console.log('No session found, redirecting to login...');
    return navigateTo('/');
  }
});