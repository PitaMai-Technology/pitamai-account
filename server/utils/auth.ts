import { betterAuth } from 'better-auth';
import { organization, magicLink, admin, captcha } from 'better-auth/plugins';
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
    enabled: false,
    requireEmailVerification: true,
    disableSignUp: false,
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
          action: 'ACCOUNT_SIGN_IN_MAGIC_LINK_SUCCESS',
          details: {
            provider: 'magic-link',
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
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });
        if (!existingUser) {
          console.log(`❌ User not found for email: ${email}`);
          // ※セキュリティ上の理由（列挙攻撃防止）でサイレント・フェイラーにする場合はここを return のみに変更してください
          throw createError({
            statusCode: 400,
            message: 'このメールアドレスは登録されていません。',
          });
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('🔗 Magic Link (Development Mode)');
          console.log(`To: ${email}`);
          console.log(`URL: ${url}`);
        }

        try {
          await sendEmail({
            to: email,
            subject: 'ログインリンク - PitaMai',
            text: `
              ログインリンク

              こんにちは、

              以下のリンクをクリックしてログインしてください：
              ${url}

              このリンクは5分間有効です。

              このメールに心当たりがない場合は、無視してください。
            `,
          });
        } catch (error) {
          console.error('❌ Failed to send magic link email:', error);
          throw new Error('Failed to send magic link email');
        }
      },
      expiresIn: 300,
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
