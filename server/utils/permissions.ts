import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements as orgDefaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from 'better-auth/plugins/organization/access';
import {
  defaultStatements as adminDefaultStatements,
  adminAc as adminPluginAc,
} from 'better-auth/plugins/admin/access';

/**
 * Better Auth の admin と organization で共用する権限定義。
 *
 * サーバー側の `admin()` / `organization()` と、クライアント側の
 * `adminClient()` / `organizationClient()` の両方に、同じ ac と roles を渡す。
 * 片側だけ直すと、画面上の判定とサーバーの判定が食い違うので注意する。
 *
 * クライアントで表示可否だけ調べる例:
 *
 * @example
 * ```ts
 * const canReadAuditLog = authClient.admin.checkRolePermission({
 *   role: 'admins',
 *   permissions: { auditLog: ['read'] },
 * })
 * ```
 *
 * サーバーで実際の操作を許可する例:
 *
 * @example
 * ```ts
 * const result = await auth.api.userHasPermission({
 *   headers: event.headers,
 *   body: { permissions: { auditLog: ['read'] } },
 * })
 *
 * if (!result.success) {
 *   throw createError({ statusCode: 403, message: '権限がありません。' })
 * }
 * ```
 *
 * クライアント側の判定は UI の出し分け用。API の保護は必ずサーバー側でも行う。
 */

const statement = {
  // Better Auth 標準の organization/member/invitation/team 権限を残す。
  ...orgDefaultStatements,
  // Better Auth 標準の user/session 権限を残す。
  ...adminDefaultStatements,

  // アプリ内の管理画面や機能で使う独自権限。
  project: ['create', 'update', 'delete', 'admin-share', 'owner'],
  auditLog: ['read', 'export'],
  userManagement: ['list', 'create', 'update', 'delete', 'set-role'],
} as const;

// `as const` を外すと action が string[] に広がり、権限名の型補完が効かなくなる。
const ac = createAccessControl(statement);

/**
 * 一般メンバー。
 *
 * organization プラグイン標準の member 権限を引き継ぎ、
 * アプリ固有の project:create だけを追加している。
 */
const member = ac.newRole({
  ...memberAc.statements,
  project: ['create'],
});

/**
 * 管理者。
 *
 * 組織内では Better Auth 標準の admin 権限を持つ。
 * グローバルなユーザー管理は一覧・詳細取得・更新だけに限定し、
 * BAN、削除、ロール変更、セッション破棄は許可しない。
 *
 * 権限を増やす例:
 *
 * @example
 * ```ts
 * user: ['list', 'get', 'update', 'ban'],
 * session: ['list'],
 * ```
 */
const admins = ac.newRole({
  ...adminAc.statements,
  user: ['list', 'get', 'update'],
  session: [],
  project: ['create', 'update', 'admin-share'],
  auditLog: ['read'],
  userManagement: ['list', 'update'],
});

/**
 * 所有者。
 *
 * organization と admin の標準管理権限をすべて引き継ぐ。
 * ユーザー削除、ロール変更、監査ログ出力など、影響の大きい操作は owner に寄せる。
 */
const owner = ac.newRole({
  ...ownerAc.statements,
  ...adminPluginAc.statements,
  project: ['create', 'update', 'admin-share', 'owner'],
  auditLog: ['read', 'export'],
  userManagement: ['list', 'create', 'update', 'delete', 'set-role'],
});

export { ac, member, admins, owner };
