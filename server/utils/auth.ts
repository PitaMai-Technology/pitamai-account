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
import { sendEmail } from '~~/server/utils/email';
import { renderEmail } from '~~/server/utils/renderEmail';
import { createError } from 'h3';
import { recordAuditLog } from '~~/server/utils/audit-recorder';
import { auditLogPlugin } from '~~/server/utils/auth-audit-plugin';
import { authGuardsPlugin } from '~~/server/utils/auth-guards-plugin';

/**
 * Better Auth のサーバー設定本体。
 *
 * サーバー API から認証機能を呼ぶ場合は、この `auth.api` を使い、
 * ブラウザーから届いた headers を必ず渡す。
 *
 * @example
 * ```ts
 * const session = await auth.api.getSession({ headers: event.headers })
 *
 * await auth.api.setRole({
 *   headers: event.headers,
 *   body: { userId, role: 'admins' },
 * })
 * ```
 *
 * クライアント側ではこのファイルを import せず、
 * `app/composable/auth-client.ts` の `authClient` を使う。
 */
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
      try {
        const html = await renderEmail('ResetPasswordEmail', {
          resetLink,
        });

        await sendEmail({
          to: user.email,
          subject: 'PitaMai - パスワード再設定',
          html,
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
      registrationRequestId: {
        type: 'string',
        required: false,
      },
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const html = await renderEmail('VerifyEmail', {
          verificationUrl: url,
        });

        await sendEmail({
          to: user.email,
          subject: 'PitaMaiアカウント - メール検証',
          html,
        });
      } catch (err) {
        console.error('❌ sendVerificationEmail failed:', err);
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
  },
  plugins: [
    // 認証・管理操作の記録はここでまとめて有効化する。
    // 個別の `/api/auth/*` ルートに監査処理を書く必要はない。
    auditLogPlugin(),

    // ロール判定だけでは表現できない、サービス固有の事前条件を適用する。
    // 現在は「未登録メールへの招待禁止」「自分自身の組織削除禁止」を扱う。
    authGuardsPlugin(),

    // OAuth/OIDC で使う署名鍵を公開するための JWT/JWKS 機能。
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

    // グローバルロールの権限は permissions.ts で定義する。
    // admins は一覧・取得・更新、owner は BAN/削除/ロール変更を含む全管理操作。
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

        const html = await renderEmail('OtpEmail', {
          otp,
          purpose,
        });

        await sendEmail({
          to: email,
          subject,
          html,
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
        const html = await renderEmail('InvitationEmail', {
          inviterEmail: data.inviter.user.email,
          organizationName: data.organization.name,
          inviteLink,
        });

        await sendEmail({
          to: data.email,
          subject: `組織内システム「PitaMaiアカウント」への招待メール`,
          html,
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
      // IDトークン (JWT) に拡張フィールドを含める
      // * 将来的に実装
      // customIdTokenClaims: ({ user }) => {
      //   return {
      //     twitterUrl: user.twitterUrl,
      //     bio: user.bio,
      //   };
      // },
      // // UserInfo エンドポイント (/oauth2/userinfo) のレスポンスに含める
      // customUserInfoClaims: ({ user }) => {
      //   return {
      //     twitterUrl: user.twitterUrl,
      //     bio: user.bio,
      //   };
      // },
      // // 広告するメタデータにサポートクレームを追加
      // advertisedMetadata: {
      //   claims_supported: ['twitterUrl', 'bio'],
      // },
    }),
  ],
});
