import { betterAuth } from 'better-auth';
import { organization, magicLink, admin } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { ac, owner, admins, member } from '~~/server/utils/permissions';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'sqlite',
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
  plugins: [
    admin({
      defaultRole: 'member',
      adminRoles: ['admins', 'owner'],
      adminUserIds: ['bIpvmmpJl3uMpCyU8RDypEGaeqijRzCk'],
      ac,
      roles: {
        owner,
        admins,
        member,
      },
    }),
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
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
