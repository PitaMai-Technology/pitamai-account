import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { logger } from '~~/server/utils/logger';

const scopeTextSchema = z.string().trim().min(1);

const schema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('create'),
    clientName: z.string().trim().min(1),
    redirectUri: z.url(),
    scopesText: scopeTextSchema,
    isPublicClient: z.boolean().default(false),
    requirePkce: z.boolean(),
  }),
  z.object({
    mode: z.literal('update'),
    clientId: z.string().trim().min(1),
    requirePkce: z.boolean(),
  }),
]);

function parseScopes(scopesText: string) {
  return scopesText
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['owner']);

    const body = await readBody(event);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const session = await auth.api.getSession({ headers: event.headers });
    const activeOrganizationId =
      typeof session?.session?.activeOrganizationId === 'string'
        ? session.session.activeOrganizationId
        : undefined;
    const userId =
      typeof session?.user?.id === 'string' ? session.user.id : undefined;

    if (parsed.data.mode === 'create') {
      const scopes = parseScopes(parsed.data.scopesText);
      if (scopes.length === 0) {
        throw createError({
          statusCode: 422,
          message: 'スコープを1つ以上入力してください',
        });
      }

      const requirePkce = parsed.data.isPublicClient
        ? true
        : parsed.data.requirePkce;

      const created = (await auth.api.createOAuthClient({
        headers: event.headers,
        body: {
          client_name: parsed.data.clientName,
          redirect_uris: [parsed.data.redirectUri],
          scope: scopes.join(' '),
          token_endpoint_auth_method: parsed.data.isPublicClient
            ? 'none'
            : 'client_secret_post',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        },
      })) as { client_id?: string; client_secret?: string };

      const clientId = created?.client_id;
      if (!clientId) {
        throw createError({
          statusCode: 500,
          message: 'OAuthクライアント作成結果の取得に失敗しました',
        });
      }

      const ownerWhere = activeOrganizationId
        ? {
            clientId,
            referenceId: activeOrganizationId,
          }
        : userId
          ? {
              clientId,
              userId,
            }
          : {
              clientId,
            };

      await prisma.oauthClient.update({
        where: {
          clientId,
        },
        data: {
          requirePKCE: requirePkce,
        },
      });

      const client = await prisma.oauthClient.findFirst({
        where: ownerWhere,
        select: {
          clientId: true,
          requirePKCE: true,
          tokenEndpointAuthMethod: true,
        },
      });

      return {
        mode: 'create',
        client: {
          client_id: client?.clientId ?? clientId,
          require_pkce: client?.requirePKCE ?? requirePkce,
          token_endpoint_auth_method:
            client?.tokenEndpointAuthMethod ??
            (parsed.data.isPublicClient ? 'none' : 'client_secret_post'),
        },
        client_secret: created?.client_secret ?? null,
      };
    }

    const existing = await prisma.oauthClient.findFirst({
      where: {
        clientId: parsed.data.clientId,
        OR: [
          ...(activeOrganizationId
            ? [{ referenceId: activeOrganizationId }]
            : []),
          ...(userId ? [{ userId }] : []),
        ],
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
      mode: 'update',
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
