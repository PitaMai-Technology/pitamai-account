import { betterAuth } from 'better-auth';
import { organization, admin, captcha, emailOTP } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { ac, owner, admins, member } from '~~/server/utils/permissions';
import prisma from '~~/lib/prisma';
import { sendEmail } from './email';
import { createError } from 'h3';
import { createAuthMiddleware } from 'better-auth/api';
import { recordAuditLog } from '~~/server/utils/audit';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    disableSignUp: true,
  },
  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: false,
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
      if (!newSession) return;

      try {
        await recordAuditLog({
          userId: newSession.user.id,
          action: 'ACCOUNT_SIGN_IN_EMAIL_OTP_SUCCESS',
          details: {
            provider: 'email-otp',
            path: ctx.path,
          },
        });
      } catch {}
    }),
  },
  plugins: [
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
              : 'パスワード再設定コード - PitaMai';

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
  ],
});
