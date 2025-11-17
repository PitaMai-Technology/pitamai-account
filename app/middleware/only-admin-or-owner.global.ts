// app/middleware/only-admin-or-owner.global.ts
import { authClient } from '~/composable/auth-client';

const REDIRECT_KEY = 'admin-original-path';

export default defineNuxtRouteMiddleware(async to => {
  // /apps/admin 配下だけ対象
  if (!to.path.startsWith('/apps/admin')) return;

  // SSR のときは sessionStorage ないので何もしない
  if (import.meta.server) return;

  // すでにリダイレクト済みかどうか
  const storedPath = sessionStorage.getItem(REDIRECT_KEY);

  // まだ保存されておらず、直打ちで admin 配下に来たと判断できる場合は一旦 /apps/dashboard へ
  if (!storedPath && to.path.startsWith('/apps/admin')) {
    sessionStorage.setItem(REDIRECT_KEY, to.fullPath);
    return navigateTo('/apps/dashboard');
  }

  // ここから先は「初期化後に元 URL に戻ってきた or 通常遷移」のパターン
  const { data, error } = await authClient.organization.hasPermission({
    permissions: {
      project: ['share'],
    },
  });

  if (error || !data?.success) {
    // 権限なし → エラー画面
    sessionStorage.removeItem(REDIRECT_KEY);
    return navigateTo('/apps/error');
  }

  // 権限 OK かつ、今いる場所が元 URL でない場合は元 URL に戻す
  if (storedPath && to.fullPath === '/apps/dashboard') {
    const destination = storedPath;
    sessionStorage.removeItem(REDIRECT_KEY);
    return navigateTo(destination);
  }

  // 通常はそのまま続行
});
