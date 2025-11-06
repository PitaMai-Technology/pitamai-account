import { betterAuth } from 'better-auth';
import { magicLink, admin } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

// メール送信用のトランスポーター設定
const prisma = new PrismaClient();
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // デバッグログを有効化
  logger: true,
  debug: process.env.NODE_ENV === 'development',
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'sqlite',
  }),
  plugins: [
    admin(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // 開発環境ではコンソールにマジックリンクを表示
        if (process.env.NODE_ENV === 'development') {
          console.log('='.repeat(80));
          console.log('🔗 Magic Link (Development Mode)');
          console.log('='.repeat(80));
          console.log(`To: ${email}`);
          console.log(`URL: ${url}`);
          console.log('='.repeat(80));
        }

        try {
          const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@example.com',
            to: email,
            subject: 'ログインリンク - PitaMAI',
            html: `
              <!DOCTYPE html>
              <html lang="ja">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
                  <h2 style="color: #2c3e50; margin-bottom: 20px;">ログインリンク</h2>
                  <p>こんにちは、</p>
                  <p>以下のボタンをクリックしてログインしてください：</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${url}" 
                       style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                      ログイン
                    </a>
                  </div>
                  <p style="color: #666; font-size: 14px;">
                    このリンクは5分間有効です。<br>
                    もしボタンが機能しない場合は、以下のURLをコピーしてブラウザに貼り付けてください：
                  </p>
                  <p style="word-break: break-all; background-color: #fff; padding: 10px; border-radius: 5px; font-size: 12px;">
                    ${url}
                  </p>
                  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                  <p style="color: #999; font-size: 12px;">
                    このメールに心当たりがない場合は、無視してください。
                  </p>
                </div>
              </body>
              </html>
            `,
            text: `
              ログインリンク
              
              こんにちは、
              
              以下のリンクをクリックしてログインしてください：
              ${url}
              
              このリンクは5分間有効です。
              
              このメールに心当たりがない場合は、無視してください。
            `,
          };

          console.log('Sending email with config:', {
            host: process.env.SMTP_HOST,
            port: smtpPort,
            secure: smtpPort === 465,
            user: process.env.SMTP_USER,
            from: process.env.SMTP_FROM,
            to: email,
          });

          await transporter.sendMail(mailOptions);

          console.log(`✅ Magic link email sent successfully to ${email}`);
        } catch (error) {
          console.error('❌ Failed to send magic link email:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            email,
            smtpConfig: {
              host: process.env.SMTP_HOST,
              port: smtpPort,
              user: process.env.SMTP_USER,
            },
          });
          throw new Error('Failed to send magic link email');
        }
      },
      expiresIn: 300, // 5分間有効
      disableSignUp: false, // 新規登録を許可
    }),
  ],
});
