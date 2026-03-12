import { createError, type H3Event } from 'h3';
import { auth } from '~~/server/utils/auth';

export type OrgRole = 'member' | 'admins' | 'owner';

type PermissionMap = Record<string, string[]>;

type HasPermissionResult = { hasPermission?: boolean } | boolean | null;

const isHttpError = (error: unknown): error is { statusCode?: number } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
};

export async function assertActiveMemberRole(
  event: H3Event,
  allowedRoles: OrgRole[]
): Promise<OrgRole> {
  const headers = event.headers;

  try {
    // グローバル owner/admins ロールを持つユーザーは常に許可
    const session = (await auth.api.getSession({
      headers,
    })) as { user?: { role?: string } } | null;

    const globalRole = session?.user?.role;
    if (globalRole === 'owner' || globalRole === 'admins') {
      return 'owner'; // グローバル owner を org ロールの owner として扱う
    }

    // グローバル権限がない場合、organization レベルのロールをチェック
    const response = (await auth.api.getActiveMemberRole({
      headers,
    })) as { role?: string } | undefined;

    const role = response?.role;

    if (!role || !allowedRoles.includes(role as OrgRole)) {
      throw createError({
        statusCode: 403,
        message: '管理者権限が必要です',
      });
    }

    return role as OrgRole;
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }

    throw createError({
      statusCode: 403,
      message: '管理者権限が必要です',
    });
  }
}

/**
 * グローバルユーザーロールをチェックするサーバー側ヘルパー。
 * 例:
 *  await assertGlobalUserRole(event, ['admins', 'owner'])
 */
export async function assertGlobalUserRole(
  event: H3Event,
  allowedRoles: OrgRole[]
): Promise<OrgRole> {
  const headers = event.headers;

  try {
    const session = (await auth.api.getSession({
      headers,
    })) as { user?: { role?: string } } | null;

    const role = session?.user?.role;

    if (!role || !allowedRoles.includes(role as OrgRole)) {
      throw createError({
        statusCode: 403,
        message: '操作する権限がありません',
      });
    }

    return role as OrgRole;
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }

    throw createError({
      statusCode: 403,
      message: '操作する権限がありません',
    });
  }
}

/**
 * Better Auth の Access Control(permissions) を使って柔軟に権限判定するサーバー側ヘルパー。
 * 例:
 *   await assertHasPermission(event, { project: ['create', 'update'] })
 */
export async function assertHasPermission(
  event: H3Event,
  permissions: PermissionMap
): Promise<void> {
  const headers = event.headers;

  try {
    const result = (await auth.api.hasPermission({
      headers,
      body: { permissions },
    })) as HasPermissionResult;

    const allowed =
      typeof result === 'boolean'
        ? result
        : typeof result === 'object' && result
          ? !!result.hasPermission
          : false;

    if (!allowed) {
      throw createError({
        statusCode: 403,
        message: '操作する権限がありません',
      });
    }
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }

    throw createError({
      statusCode: 403,
      message: '操作する権限がありません',
    });
  }
}

export async function assertHasAnyPermission(
  event: H3Event,
  candidates: PermissionMap[]
): Promise<void> {
  for (const permissions of candidates) {
    try {
      await assertHasPermission(event, permissions);
      return; // 1つでも通ればOK
    } catch {
      // 次の候補へ
    }
  }

  throw createError({
    statusCode: 403,
    message: '操作する権限がありません',
  });
}
