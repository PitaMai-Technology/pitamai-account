import { readBody, createError } from 'h3';
import { z } from 'zod';
import { auth } from '~~/server/utils/auth';
import { logger } from '~~/server/utils/logger';

type PermissionMap = Record<string, string[]>;

type HasPermissionResult = { hasPermission?: boolean } | boolean | null;

const BodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    role: z.enum(['member', 'admins', 'owner']).optional(),
    // better-auth admin docs: permission / permissions のどちらか
    permission: z.record(z.string(), z.array(z.string())).optional(),
    permissions: z.record(z.string(), z.array(z.string())).optional(),
  })
  .refine(v => v.permission || v.permissions, {
    message: 'permission または permissions のいずれかを指定してください',
  });

type Body = z.infer<typeof BodySchema>;

function normalizeHasPermission(result: HasPermissionResult): boolean {
  if (typeof result === 'boolean') return result;
  if (result && typeof result === 'object') return !!result.hasPermission;
  return false;
}

export default defineEventHandler(async event => {
  let body: Body | undefined;

  try {
    const raw = await readBody(event);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    body = parsed.data;
    const permissions = (body.permissions ?? body.permission) as PermissionMap;

    const result =
      body.userId || body.role
        ? ((await auth.api.userHasPermission({
            headers: event.headers,
            body: {
              userId: body.userId,
              role: body.role,
              permissions,
            },
          })) as HasPermissionResult)
        : ((await auth.api.hasPermission({
            headers: event.headers,
            body: { permissions },
          })) as HasPermissionResult);

    return { hasPermission: normalizeHasPermission(result) };
  } catch (e: unknown) {
    logger.error({ err: e, body }, 'auth/admin/has-permission error');

    // 認証/認可用途なので、詳細は返さず false で統一
    return { hasPermission: false };
  }
});
