import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { assertGlobalUserRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';

const schema = z.object({
  clientId: z.string().trim().min(1),
  requirePkce: z.boolean(),
});

export default defineEventHandler(async event => {
  try {
    await assertGlobalUserRole(event, ['member', 'admins', 'owner']);

    const body = await readBody(event);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const session = await auth.api.getSession({ headers: event.headers });
    if (!session?.user?.id) {
      throw createError({
        statusCode: 401,
        message: '認証が必要です',
      });
    }

    const activeOrganizationId =
      typeof session?.session?.activeOrganizationId === 'string'
        ? session.session.activeOrganizationId
        : undefined;
    const userId =
      typeof session?.user?.id === 'string' ? session.user.id : undefined;

    const orConditions = [
      ...(activeOrganizationId ? [{ referenceId: activeOrganizationId }] : []),
      ...(userId ? [{ userId }] : []),
    ];

    if (orConditions.length === 0) {
      throw createError({
        statusCode: 403,
        message: 'アクセス権限がありません',
      });
    }

    const existing = await prisma.oauthClient.findFirst({
      where: {
        clientId: parsed.data.clientId,
        OR: orConditions,
      },
      select: {
        id: true,
        clientId: true,
        tokenEndpointAuthMethod: true,
      },
    });

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: '対象のOAuthクライアントが見つかりません',
      });
    }

    const requirePkce =
      existing.tokenEndpointAuthMethod === 'none'
        ? true
        : parsed.data.requirePkce;

    const updated = await prisma.oauthClient.update({
      where: {
        id: existing.id,
      },
      data: {
        requirePKCE: requirePkce,
      },
      select: {
        clientId: true,
        requirePKCE: true,
        tokenEndpointAuthMethod: true,
      },
    });

    return {
      client: {
        client_id: updated.clientId,
        require_pkce: updated.requirePKCE ?? true,
        token_endpoint_auth_method: updated.tokenEndpointAuthMethod,
      },
    };
  } catch (error) {
    logger.error({ error }, 'require-pkce API error');

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: 'PKCE設定の操作に失敗しました',
    });
  }
});
