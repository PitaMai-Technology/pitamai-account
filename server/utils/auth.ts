import { betterAuth } from 'better-auth';
import { organization, magicLink, emailOTP } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'sqlite',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`🔔 sendVerificationEmail called for ${user.email}`);
      console.log(`🔗 verification url: ${url}`);
      try {
        await sendEmail({
          to: user.email,
          subject: "pitaMAI Hub - 認証コード",
          text: `認証コードです: ${url}`,
        });
        console.log(`✅ Verification email queued/sent to ${user.email}`);
      } catch (err) {
        console.error('❌ sendVerificationEmail failed:', err);
        // 失敗をそのまま投げて Better Auth 側で扱わせる（ログ確認用）
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('='.repeat(80));
          console.log('🔗 Magic Link (Development Mode)');
          console.log('='.repeat(80));
          console.log(`To: ${email}`);
          console.log(`URL: ${url}`);
          console.log('='.repeat(80));
        }

        try {
          await sendEmail({
            to: email,
            subject: 'ログインリンク - PitaMAI',
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
      disableSignUp: false,
    }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        let subject = '';
        let text = '';

        if (type === "sign-in") {
          subject = 'pitaMAI Hub - サインイン認証コード';
          text = `サインイン用の認証コード: ${otp}\nこのコードは5分間有効です。`;
        } else if (type === "email-verification") {
          subject = 'pitaMAI Hub - メール認証コード';
          text = `メール認証用の認証コード: ${otp}\nこのコードは5分間有効です。`;
        } else {
          subject = 'pitaMAI Hub - パスワードリセット認証コード';
          text = `パスワードリセット用の認証コード: ${otp}\nこのコードは5分間有効です。`;
        }

        try {
          await sendEmail({
            to: email,
            subject,
            text,
          });
          console.log(`✅ OTPメール送信: ${type} - ${email}`);
        } catch (error) {
          console.error('❌ OTPメール送信失敗:', error);
          throw new Error('OTPメール送信に失敗しました');
        }
      },
    }),
    organization(),
  ],
});
