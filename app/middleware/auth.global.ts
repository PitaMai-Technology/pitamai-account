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

  try {
    // Better Auth クライアントを使用してセッションを取得
    // headers は composable/auth-client.ts または内部で自動処理されます
    const { data: session, error } = await authClient.getSession({
      fetchOptions: {
        headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
      },
    });

    if (error || !session?.user) {
      console.log('No session found, redirecting to login...');
      return navigateTo('/');
    }
  } catch (error) {
    console.error('認証チェック中にエラーが発生しました:', error);
    return navigateTo('/');
  }
});
