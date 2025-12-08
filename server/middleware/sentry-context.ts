import * as Sentry from '@sentry/nuxt';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  // 認証セッションを取得
  const session = await auth.api.getSession({
    headers: event.headers,
  });

  if (session?.user) {
    // Sentry にユーザー情報をセット
    Sentry.setUser({
      activeorganizationid: session.session.activeOrganizationId,
      id: session.user.id,
      email: session.user.email,
      username: session.user.name,
    });
  } else {
    // 未認証の場合はユーザー情報をクリア
    Sentry.setUser({
      username: 'guest(未認証ユーザー)',
    });
  }

  // リクエストごとのタグ付け（必要に応じて）
  Sentry.setTag('url', event.node.req.url);
  Sentry.setTag('method', event.node.req.method);
});
