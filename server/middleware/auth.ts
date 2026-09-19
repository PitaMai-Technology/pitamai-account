import { createError } from 'h3';
import { auth } from '~~/server/utils/auth';

/**
 * アプリ固有 API (`/api/pitamai/*`) の共通認証ミドルウェア。
 *
 * `/api/auth/*` は Better Auth 自身がセッションと権限を確認するため、ここでは扱わない。
 * pitamai API を公開 API にしたい場合は、この条件へ例外を追加するのではなく、
 * 公開 API 用のパスを分けた方が意図が伝わりやすい。
 *
 * このミドルウェアは「ログイン済み」までしか保証しない。
 * owner 限定などの操作では、API 内で `auth.api.userHasPermission()` も実行する。
 *
 * @example
 * ```ts
 * const permission = await auth.api.userHasPermission({
 *   headers: event.headers,
 *   body: { permissions: { auditLog: ['read'] } },
 * })
 * ```
 */
export default defineEventHandler(async event => {
  if (!event.path.startsWith('/api/pitamai/')) {
    return;
  }

  const session = await auth.api.getSession({
    // cookie を含むリクエストヘッダーを渡さないと、サーバー側では本人を特定できない。
    headers: event.headers,
  });

  if (!session) {
    throw createError({
      statusCode: 401,
      message: '認証をしてください。',
    });
  }
});
