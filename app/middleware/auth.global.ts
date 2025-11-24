export default defineNuxtRouteMiddleware(async to => {
  // ログインページは認証チェックをスキップ
  if (to.path === '/') {
    return;
  }
  // appsディレクトリ配下のみ認証チェック
  if (!to.path.startsWith('/apps')) {
    return;
  }

  // サーバー側レンダリング時は cookie を含めるため、リクエストヘッダーを渡す。
  // クライアント側ではそのまま $fetch を呼び出せばよい。
  try {
    const headers = import.meta.server
      ? useRequestHeaders(['cookie'])
      : undefined;

    // server/api/auth/get-session.ts は認証が無ければ null を返す
    const session = await $fetch('/api/auth/get-session', { headers }).catch(
      () => null
    );

    if (!session || !session.user) {
      console.log('No session found, redirecting to login...');
      return navigateTo('/');
    }
  } catch (error) {
    console.error('認証チェック中にエラーが発生しました:', error);
    return navigateTo('/');
  }
});
