import type { H3Event } from 'h3';
import { auth } from '~~/server/utils/auth';
import { recordAuditLog } from '~~/server/utils/audit-recorder';

/**
 * Nuxt API から使うための入口。
 *
 * `recordAuditLog` は保存だけ、`logAuditWithSession` は現在のセッション取得まで行う。
 * Better Auth の hook からこのファイルを import すると `auth.ts` と循環するため、
 * hook 側では `audit-recorder.ts` を直接使う。
 */
/**
 * H3Event からログイン中のユーザーを取得して監査ログを残す。
 * アプリ固有の `/api/pitamai/*` で使う想定。
 *
 * @example
 * ```ts
 * export default defineEventHandler(async event => {
 *   // 先に本来の処理を終わらせる
 *   await updateSomething()
 *
 *   await logAuditWithSession(event, {
 *     action: 'SOMETHING_UPDATE',
 *     targetId: 'target-id',
 *     organizationId: 'organization-id',
 *     details: { changedFields: ['name'] },
 *   })
 * })
 * ```
 *
 * 未ログインなら何も記録せず終了する。認証必須 API では、通常は先に
 * `server/middleware/auth.ts` または Better Auth API で認証を保証しておく。
 */
export const logAuditWithSession = async (
  event: H3Event,
  params: {
    action: string;
    targetId?: string;
    organizationId?: string;
    details?: Record<string, unknown>;
  }
) => {
  const session = await auth.api.getSession({ headers: event.headers });
  if (!session?.user) return;

  await recordAuditLog({
    userId: session.user.id,
    action: params.action,
    targetId: params.targetId,
    organizationId: params.organizationId,
    details: params.details,
    event,
  });
};
