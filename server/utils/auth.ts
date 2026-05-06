import { betterAuth } from 'better-auth';
import {
  organization,
  admin,
  captcha,
  emailOTP,
  jwt,
} from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { ac, owner, admins, member } from '~~/server/utils/permissions';
import prisma from '~~/lib/prisma';
import { sendEmail } from './email';
import { createError } from 'h3';
import { createAuthMiddleware } from 'better-auth/api';
import { recordAuditLog } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';

type OAuthClientAuditBody = {
  client_id?: string;
  client_name?: string;
  redirect_uris?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
  update?: {
    client_name?: string;
    redirect_uris?: string[];
    scope?: string;
    token_endpoint_auth_method?: string;
  };
};

type OAuthClientAuditResponse = {
  client_id?: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
  client?: {
    client_id?: string;
    client_name?: string;
    redirect_uris?: string[];
    scope?: string;
    token_endpoint_auth_method?: string;
  };
};

type AuthHookContextLike = {
  body?: unknown;
  context: {
    returned?: unknown;
  };
};

const getAuthHookResponse = async <T>(
  ctx: AuthHookContextLike
): Promise<T | null> => {
  const returned = ctx.context.returned;
  if (!returned) return null;

  if (returned instanceof Response) {
    // Check for any 2xx status code (success range)
    if (returned.status < 200 || returned.status >= 300) {
      return null;
    }

    // Handle 204 No Content - no body to parse
    if (returned.status === 204) {
      return null;
    }

    // For other 2xx statuses (200, 201, etc.), parse the JSON body
    return (await returned.clone().json()) as T;
  }

  return returned as T;
};

const getOAuthClientAuditPayload = async (ctx: AuthHookContextLike) => {
  const body = (
    ctx.body && typeof ctx.body === 'object' ? ctx.body : {}
  ) as OAuthClientAuditBody;

  const response = await getAuthHookResponse<OAuthClientAuditResponse>(ctx);
  const responseClient =
    response &&
    typeof response === 'object' &&
    response.client &&
    typeof response.client === 'object'
      ? response.client
      : undefined;

  return {
    clientId:
      response?.client_id ?? responseClient?.client_id ?? body.client_id,
    details: {
      clientName:
        response?.client_name ??
        responseClient?.client_name ??
        body.client_name ??
        body.update?.client_name,
      redirectUris:
        response?.redirect_uris ??
        responseClient?.redirect_uris ??
        body.redirect_uris ??
        body.update?.redirect_uris,
      scope:
        response?.scope ??
        responseClient?.scope ??
        body.scope ??
        body.update?.scope,
      tokenEndpointAuthMethod:
        response?.token_endpoint_auth_method ??
        responseClient?.token_endpoint_auth_method ??
        body.token_endpoint_auth_method ??
        body.update?.token_endpoint_auth_method,
    },
  };
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  advanced: {
    cookiePrefix: process.env.BETTER_AUTH_COOKIE_PREFIX ?? 'pitamai-auth',
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip'], // or any other custom header
    },
  },
  // セキュリティ強化: Cookie 設定
  // HttpOnly: JavaScript からアクセス不可（XSS 対策）
  // Secure: HTTPS のみで送信
  // SameSite: CSRF 対策（Strict = 同一サイトのみ）
  // maxAge: セッション 7 日間（必要に応じて調整）
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
    storeSessionInDatabase: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    disableSignUp: true,
    sendResetPassword: async ({ user, url, token }) => {
      const config = useRuntimeConfig();
      const resetLink = `${config.public.BETTER_AUTH_URL}/reset-password?token=${token}`;
      console.log(`🔔 sendResetPassword called for ${user.email}`);
      console.log(`🔗 password reset url: ${resetLink}`);
      try {
        await sendEmail({
          to: user.email,
          subject: 'PitaMai - パスワード再設定',
          text: `パスワード再設定のためのリンク: ${resetLink}\n\nこのリンクは有効期限があります。\nこのメールに心当たりがない場合は無視してください。`,
        });
      } catch (err) {
        console.error('❌ sendResetPassword failed:', err);
        throw err instanceof Error ? err : new Error(String(err));
      }

      await recordAuditLog({
        userId: user.id,
        action: 'FORGOT_PASSWORD_EMAIL_SENT',
        details: {
          email: user.email,
        },
      });
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: false,
    },
    additionalFields: {
      twitterUrl: {
        type: 'string',
        required: false,
      },
      bio: {
        type: 'string',
        required: false,
      },
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`🔔 sendVerificationEmail called for ${user.email}`);
      console.log(`🔗 verification url: ${url}`);
      try {
        await sendEmail({
          to: user.email,
          subject: 'MaiMai Hub - メール検証',
          text: `メール検証のためのリンク: ${url}\n\nこのリンクは有効期限があります。`,
        });
      } catch (err) {
        console.error('❌ sendVerificationEmail failed:', err);
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
  },
  hooks: {
    after: createAuthMiddleware(async ctx => {
      const newSession = ctx.context.newSession;
      if (newSession) {
        let action: string;
        let provider: string;
        // パスに基づいて認証経路を判別
        if (ctx.path.startsWith('/sign-in/email-otp')) {
          action = 'ACCOUNT_SIGN_IN_EMAIL_OTP_SUCCESS';
          provider = 'email-otp';
        } else if (ctx.path.startsWith('/sign-in/email')) {
          action = 'ACCOUNT_SIGN_IN_EMAIL_PASSWORD_SUCCESS';
          provider = 'email-password';
        } else if (ctx.path.startsWith('/sign-up/email')) {
          action = 'ACCOUNT_SIGN_UP_EMAIL_SUCCESS';
          provider = 'email-password';
        } else if (ctx.path.startsWith('/verify-email')) {
          action = 'ACCOUNT_EMAIL_VERIFICATION_SUCCESS';
          provider = 'email-verification';
        } else {
          // その他の認証経路
          action = 'ACCOUNT_SIGN_IN_SUCCESS';
          provider = 'unknown';
        }
        try {
          await recordAuditLog({
            userId: newSession.user.id,
            action: action,
            details: {
              provider: provider,
              path: ctx.path,
            },
          });
        } catch (e) {
          logger.error({ error: e }, 'Failed to record sign-in audit log');
        }
      }
      // OAuth2 Consent Logging
      if (
        ctx.path.endsWith('/oauth2/consent') &&
        ctx.request?.method === 'POST'
      ) {
        try {
          const body = (
            ctx.body && typeof ctx.body === 'object' ? ctx.body : {}
          ) as { accept?: boolean; scope?: string };
          const session = await auth.api.getSession({
            headers: ctx.headers || {},
          });
          if (session?.user) {
            await recordAuditLog({
              userId: session.user.id,
              action: body.accept
                ? 'OAUTH_CONSENT_ACCEPTED'
                : 'OAUTH_CONSENT_DENIED',
              details: {
                scope: body.scope,
                path: ctx.path,
              },
            });
          }
        } catch (e) {
          logger.error(
            { error: e },
            'Failed to record OAuth consent audit log'
          );
        }
      }
      const oauthClientAuditActions = {
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

      const oauthClientActionPair =
        oauthClientAuditActions[
          ctx.path as keyof typeof oauthClientAuditActions
        ];

      if (oauthClientActionPair && ctx.request?.method === 'POST') {
        try {
          const response =
            await getAuthHookResponse<OAuthClientAuditResponse>(ctx);
          const isSuccess =
            response !== null &&
            !('error' in response) &&
            !('code' in response);
          const oauthClientAction = isSuccess
            ? oauthClientActionPair.success
            : oauthClientActionPair.failed;

          const payload = await getOAuthClientAuditPayload(ctx);
          const session = await auth.api.getSession({
            headers: ctx.headers || {},
          });

          if (session?.user?.id) {
            const activeOrganizationId =
              typeof session.session?.activeOrganizationId === 'string'
                ? session.session.activeOrganizationId
                : undefined;

            await recordAuditLog({
              userId: session.user.id,
              organizationId: activeOrganizationId,
              action: oauthClientAction,
              targetId: payload.clientId,
              details: {
                path: ctx.path,
                success: isSuccess,
                ...payload.details,
              },
            });
          }
        } catch (e) {
          logger.error(
            { error: e, path: ctx.path },
            'Failed to record OAuth client audit log'
          );
        }
      }
    }),
  },
  plugins: [
    jwt({
      jwks: {
        keyPairConfig: {
          alg: 'RS256',
        },
      },
    }),
    captcha({
      provider: 'cloudflare-turnstile', // or google-recaptcha, hcaptcha, captchafox
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
    }),
    admin({
      defaultRole: 'member',
      adminRoles: ['admins', 'owner'],
      ac,
      roles: {
        owner,
        admins,
        member,
      },
      bannedUserMessage: 'あなたのアカウントは停止(BAN)されています。',
    }),
    emailOTP({
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      expiresIn: 300,
      async sendVerificationOTP({ email, otp, type }) {
        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (type === 'sign-in' && !existingUser) {
          throw createError({
            statusCode: 400,
            message: 'このメールアドレスは登録されていません。',
          });
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('🔐 Email OTP (Development Mode)');
          console.log(`To: ${email}`);
          console.log(`Type: ${type}`);
          console.log(`OTP: ${otp}`);
        }

        const subject =
          type === 'sign-in'
            ? 'ログイン認証コード - PitaMai'
            : type === 'email-verification'
              ? 'メール認証コード - PitaMai'
              : 'パスワード設定コード - PitaMai';

        const purpose =
          type === 'sign-in'
            ? 'ログイン'
            : type === 'email-verification'
              ? 'メール認証'
              : 'パスワード設定';

        await sendEmail({
          to: email,
          subject,
          text: `${purpose}の認証コード: ${otp}\n\nこのコードは5分間有効です。\nこのメールに心当たりがない場合は無視してください。`,
        });

        await recordAuditLog({
          userId: existingUser?.id,
          action:
            type === 'sign-in'
              ? 'ACCOUNT_SIGN_IN_EMAIL_OTP_SENT'
              : type === 'email-verification'
                ? 'SEND_VERIFICATION_EMAIL_OTP'
                : 'FORGOT_PASSWORD_EMAIL_OTP_SENT',
          details: {
            email,
            type,
          },
        });
      },
    }),
    organization({
      async sendInvitationEmail(data) {
        const config = useRuntimeConfig();
        const inviteLink =
          config.public.BETTER_AUTH_URL +
          `/apps/organization/accept-invitation?invitationId=${data.id}`;
        await sendEmail({
          to: data.email,
          subject: `組織内システム「MaiMai Hub」への招待メール`,
          text: `
              招待リンクです。
              ${data.inviter.user.email}さんからの招待です。

              あなたは「${data.organization.name}」のメンバーとして招待されています。
              
              以下のリンクをクリックしてログインしてください：
              
              ${inviteLink}

              このメールに心当たりがない場合は、無視してください。
            `,
        });
      },
      ac,
      roles: {
        owner,
        admins,
        member,
      },
    }),
    oauthProvider({
      loginPage: '/login',
      consentPage: '/consent',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      validAudiences: [
        process.env.OAUTH_DEFAULT_AUDIENCE ?? process.env.BETTER_AUTH_URL ?? '',
      ].filter(Boolean),
      clientReference: ({ session }) => {
        const activeOrganizationId = session?.activeOrganizationId;
        return typeof activeOrganizationId === 'string'
          ? activeOrganizationId
          : undefined;
      },
      // リダイレクトURI バリデーション設定
      // 開発環境：http://localhost のリダイレクトURIを許可
      // 本番環境：HTTPS のリダイレクトURIのみ許可（allowInsecureRedirectUris: false）
      allowInsecureRedirectUris: process.env.NODE_ENV !== 'production',
      // 互換性維持のため、PKCEは必須にしない。
      requirePKCE: false,
      // Refresh Token Rotation を無効化（互換性維持のため）
      disableRefreshTokenRotation: true,
    }),
  ],
});
