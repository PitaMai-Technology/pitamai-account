import { authClient } from '~/composable/auth-client';

export default defineNuxtRouteMiddleware(async to => {
  // ログインページは認証チェックをスキップ
  if (to.path === '/') {
    return;
  }
  // appsディレクトリ配下のみ認証チェック
  if (!to.path.startsWith('/apps')) {
    return;
  }

  // better-auth側がバグってusefetchが使えないため、一旦ラップする
  const relativeFetch = ((url: string, opts?: any) => {
    try {
      if (url.startsWith('http')) url = new URL(url).pathname;
    } catch (error: unknown) {
      console.error('Error parsing URL in auth middleware:', error);
    }
    return useFetch(url, opts);
  }) as any;
  const { data: session } = await authClient.useSession(relativeFetch);
  // const { data: sessionUsefetch } = await authClient.useSession(useFetch);

  if (!session.value) {
    console.log('No session found, redirecting to login...');
    return navigateTo('/');
  }
});
