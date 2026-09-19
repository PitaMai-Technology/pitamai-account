import { auth } from '~~/server/utils/auth';

/**
 * Better Auth の HTTP エンドポイントを Nuxt/Nitro に公開する唯一のルート。
 *
 * `/api/auth/*` はすべてこのファイルに入り、Better Auth がパスに応じて処理する。
 * たとえば次の操作も、個別の Nuxt API ファイルを作らずに利用できる。
 *
 * クライアント側:
 *
 * @example
 * ```ts
 * await authClient.admin.banUser({ userId, banReason: '利用規約違反' })
 * await authClient.organization.updateMemberRole({
 *   memberId,
 *   organizationId,
 *   role: 'admins',
 * })
 * ```
 *
 * サーバー側:
 *
 * @example
 * ```ts
 * await auth.api.banUser({
 *   headers: event.headers,
 *   body: { userId, banReason: '利用規約違反' },
 * })
 * ```
 *
 * `server/api/auth/admin/*` のような中継ルートは原則追加しない。
 * アプリ固有のデータ結合や業務処理が必要なら `/api/pitamai/*` に分ける。
 */
export default defineEventHandler(event => {
  // H3Event を標準の Request に変換し、以降のルーティングは Better Auth に任せる。
  return auth.handler(toWebRequest(event));
});
