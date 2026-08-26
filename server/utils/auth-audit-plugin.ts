import type { BetterAuthPlugin } from 'better-auth';
import {
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api';
import { recordAuditLog } from '~~/server/utils/audit-recorder';
import { logger } from '~~/server/utils/logger';

/**
 * Better Auth のエンドポイントを横断して監査ログを残すためのプラグイン。
 *
 * 管理 API ごとに Nuxt のルートを作るのではなく、Better Auth の hook で
 * リクエスト前後を拾う。クライアントから呼んでも `auth.api` から直接呼んでも
 * 同じ場所を通るので、記録漏れを増やしにくい。
 *
 * `server/utils/auth.ts` では次のように登録して使う。
 *
 * @example
 * ```ts
 * plugins: [
 *   auditLogPlugin(),
 *   admin(...),
 *   organization(...),
 * ]
 * ```
 *
 * 監査対象を追加するときは、基本的に `responseAuditActions` にパスと
 * 成功・失敗時の action 名を足す。操作開始時点も記録したい場合だけ
 * `requestAuditActions` にも追加する。
 */

type JsonRecord = Record<string, unknown>;

// hook の body/response はエンドポイントごとに形が違う。
// ここで一度 Record に寄せ、下では必要な値だけ typeof で絞り込む。
const asRecord = (value: unknown): JsonRecord =>
  typeof value === 'object' && value !== null ? (value as JsonRecord) : {};

// Better Auth の返り値は通常のオブジェクトと Response の両方があり得る。
// Response は clone して読む。元のレスポンス本文を消費しないために clone が必要。
const getReturnedRecord = async (returned: unknown): Promise<JsonRecord> => {
  if (!(returned instanceof Response)) return asRecord(returned);
  if (!returned.ok || returned.status === 204) return {};

  try {
    return asRecord(await returned.clone().json());
  } catch {
    return {};
  }
};

const isSuccessful = (returned: unknown) => {
  if (isAPIError(returned)) return false;
  if (returned instanceof Response) return returned.ok;

  const record = asRecord(returned);
  return !('error' in record) && !('code' in record);
};

// 「実行を受け付けた」こと自体を残したい操作だけをここに置く。
// たとえば BAN は REQUEST と SUCCESS/FAILED の2段階で追跡できる。
//
// 追加例:
// '/admin/revoke-user-session': 'ADMIN_ACCOUNT_SESSION_REVOKE_REQUEST',
const requestAuditActions = {
  '/admin/ban-user': 'ADMIN_ACCOUNT_BAN_REQUEST',
  '/admin/unban-user': 'ADMIN_ACCOUNT_UNBAN_REQUEST',
  '/admin/remove-user': 'ADMIN_ACCOUNT_REMOVE_REQUEST',
  '/admin/revoke-user-sessions': 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_REQUEST',
} as const;

// Better Auth の ctx.path は `/api/auth` を含まない。
// `/api/auth/admin/ban-user` の場合、ここで使う値は `/admin/ban-user`。
//
// 追加例:
// '/organization/cancel-invitation': {
//   success: 'MEMBER_INVITATION_CANCEL',
//   failed: 'MEMBER_INVITATION_CANCEL_FAILED',
// },
const responseAuditActions = {
  '/admin/ban-user': {
    success: 'ADMIN_ACCOUNT_BAN_SUCCESS',
    failed: 'ADMIN_ACCOUNT_BAN_FAILED',
  },
  '/admin/unban-user': {
    success: 'ADMIN_ACCOUNT_UNBAN_SUCCESS',
    failed: 'ADMIN_ACCOUNT_UNBAN_FAILED',
  },
  '/admin/remove-user': {
    success: 'ADMIN_ACCOUNT_REMOVE_SUCCESS',
    failed: 'ADMIN_ACCOUNT_REMOVE_FAILED',
  },
  '/admin/revoke-user-sessions': {
    success: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_SUCCESS',
    failed: 'ADMIN_ACCOUNT_SESSIONS_REVOKE_ALL_FAILED',
  },
  '/admin/list-user-sessions': {
    success: 'ADMIN_ACCOUNT_SESSIONS_LIST',
    failed: 'ADMIN_ACCOUNT_SESSIONS_LIST_FAILED',
  },
  '/admin/set-role': {
    success: 'ADMIN_ACCOUNT_ROLE_SET',
    failed: 'ADMIN_ACCOUNT_ROLE_SET_FAILED',
  },
  '/organization/create': {
    success: 'ORGANIZATION_CREATE',
    failed: 'ORGANIZATION_CREATE_FAILED',
  },
  '/organization/update': {
    success: 'ORGANIZATION_UPDATE',
    failed: 'ORGANIZATION_UPDATE_FAILED',
  },
  '/organization/delete': {
    success: 'ORGANIZATION_DELETE',
    failed: 'ORGANIZATION_DELETE_FAILED',
  },
  '/organization/invite-member': {
    success: 'MEMBER_INVITE',
    failed: 'MEMBER_INVITE_FAILED',
  },
  '/organization/remove-member': {
    success: 'MEMBER_REMOVE',
    failed: 'MEMBER_REMOVE_FAILED',
  },
  '/organization/update-member-role': {
    success: 'MEMBER_ROLE_UPDATE',
    failed: 'MEMBER_ROLE_UPDATE_FAILED',
  },
  '/organization/accept-invitation': {
    success: 'MEMBER_ACCEPT_INVITATION',
    failed: 'MEMBER_ACCEPT_INVITATION_FAILED',
  },
  '/oauth2/create-client': {
    success: 'OAUTH_CLIENT_CREATE',
    failed: 'OAUTH_CLIENT_CREATE_FAILED',
  },
  '/oauth2/update-client': {
    success: 'OAUTH_CLIENT_UPDATE',
    failed: 'OAUTH_CLIENT_UPDATE_FAILED',
  },
  '/oauth2/delete-client': {
    success: 'OAUTH_CLIENT_DELETE',
    failed: 'OAUTH_CLIENT_DELETE_FAILED',
  },
} as const;

// get-session のような高頻度 API では監査処理を動かさない。
// 対象パスだけに絞ることで、不要なセッション取得や DB 書き込みを避ける。
const shouldAuditResponse = (path: string) =>
  path in responseAuditActions ||
  path === '/oauth2/consent' ||
  path.startsWith('/sign-in/') ||
  path.startsWith('/sign-up/') ||
  path.startsWith('/verify-email') ||
  path.startsWith('/callback/');

export const auditLogPlugin = () =>
  ({
    id: 'pitamai-audit-log',
    hooks: {
      before: [
        {
          matcher: ctx => ctx.path in requestAuditActions,
          handler: createAuthMiddleware(async ctx => {
            try {
              // getSessionFromCtx を使うと、cookie や Authorization ヘッダーから
              // Better Auth と同じ方法で実行者を特定できる。
              const session = await getSessionFromCtx(ctx);
              if (!session?.user.id) return;

              const body = asRecord(ctx.body);
              const action =
                requestAuditActions[
                  ctx.path as keyof typeof requestAuditActions
                ];

              await recordAuditLog({
                userId: session.user.id,
                organizationId:
                  typeof body.organizationId === 'string'
                    ? body.organizationId
                    : undefined,
                action,
                targetId:
                  typeof body.userId === 'string' ? body.userId : undefined,
                details: { path: ctx.path, ...body },
                request: ctx.request,
              });
            } catch (error) {
              // 監査ログの障害で本来の管理操作まで止めない。
              // 保存失敗は logger/Sentry 側で別途追跡する。
              logger.error(
                { error, path: ctx.path },
                'Failed to record Better Auth request audit log'
              );
            }
          }),
        },
      ],
      after: [
        {
          matcher: ctx => shouldAuditResponse(ctx.path),
          handler: createAuthMiddleware(async ctx => {
            try {
              const body = asRecord(ctx.body);
              const returned = ctx.context.returned;
              const response = await getReturnedRecord(returned);
              const newSession = ctx.context.newSession;
              const session = newSession ?? (await getSessionFromCtx(ctx));

              // ログイン成功時は newSession が入る。
              // パスから認証方法を判定し、同じユーザーでも OTP とパスワードを区別する。
              if (newSession?.user.id) {
                const provider = ctx.path.startsWith('/sign-in/email-otp')
                  ? 'email-otp'
                  : ctx.path.startsWith('/sign-in/email')
                    ? 'email-password'
                    : ctx.path.startsWith('/sign-up/email')
                      ? 'email-password'
                      : ctx.path.startsWith('/verify-email')
                        ? 'email-verification'
                        : 'unknown';
                const action = ctx.path.startsWith('/sign-in/email-otp')
                  ? 'ACCOUNT_SIGN_IN_EMAIL_OTP_SUCCESS'
                  : ctx.path.startsWith('/sign-in/email')
                    ? 'ACCOUNT_SIGN_IN_EMAIL_PASSWORD_SUCCESS'
                    : ctx.path.startsWith('/sign-up/email')
                      ? 'ACCOUNT_SIGN_UP_EMAIL_SUCCESS'
                      : ctx.path.startsWith('/verify-email')
                        ? 'ACCOUNT_EMAIL_VERIFICATION_SUCCESS'
                        : 'ACCOUNT_SIGN_IN_SUCCESS';

                await recordAuditLog({
                  userId: newSession.user.id,
                  action,
                  details: { provider, path: ctx.path },
                  request: ctx.request,
                });
              }

              if (!session?.user.id) return;

              // 組織 ID が body にない操作では、現在選択中の組織を補助情報に使う。
              const activeOrganizationId =
                typeof session.session?.activeOrganizationId === 'string'
                  ? session.session.activeOrganizationId
                  : undefined;

              if (ctx.path === '/oauth2/consent') {
                await recordAuditLog({
                  userId: session.user.id,
                  organizationId: activeOrganizationId,
                  action: body.accept
                    ? 'OAUTH_CONSENT_ACCEPTED'
                    : 'OAUTH_CONSENT_DENIED',
                  details: { scope: body.scope, path: ctx.path },
                  request: ctx.request,
                });
                return;
              }

              const actionPair =
                responseAuditActions[
                  ctx.path as keyof typeof responseAuditActions
                ];
              if (!actionPair) return;

              const success = isSuccessful(returned);
              const responseClient = asRecord(response.client);
              const responseMember = asRecord(response.member);
              const update = asRecord(body.update);
              const organizationId =
                typeof body.organizationId === 'string'
                  ? body.organizationId
                  : typeof response.id === 'string' &&
                      ctx.path === '/organization/create'
                    ? response.id
                    : activeOrganizationId;

              // エンドポイントによって対象 ID の置き場所が異なるため、
              // 明示的な user/member/client ID を優先し、最後に response.id を見る。
              const targetId =
                typeof body.userId === 'string'
                  ? body.userId
                  : typeof body.memberId === 'string'
                    ? body.memberId
                    : typeof body.memberIdOrEmail === 'string'
                      ? body.memberIdOrEmail
                      : typeof body.email === 'string'
                        ? body.email
                        : typeof body.client_id === 'string'
                          ? body.client_id
                          : typeof response.client_id === 'string'
                            ? response.client_id
                            : typeof responseClient.client_id === 'string'
                              ? responseClient.client_id
                              : typeof responseMember.id === 'string'
                                ? responseMember.id
                                : typeof response.id === 'string'
                                  ? response.id
                                  : undefined;

              await recordAuditLog({
                userId: session.user.id,
                organizationId,
                action: success ? actionPair.success : actionPair.failed,
                targetId,
                details: {
                  path: ctx.path,
                  success,
                  role: body.role,
                  scope: body.scope ?? update.scope,
                  clientName: body.client_name ?? update.client_name,
                  redirectUris: body.redirect_uris ?? update.redirect_uris,
                  tokenEndpointAuthMethod:
                    body.token_endpoint_auth_method ??
                    update.token_endpoint_auth_method,
                  errorMessage: isAPIError(returned)
                    ? returned.message
                    : undefined,
                },
                request: ctx.request,
              });
            } catch (error) {
              logger.error(
                { error, path: ctx.path },
                'Failed to record Better Auth response audit log'
              );
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
