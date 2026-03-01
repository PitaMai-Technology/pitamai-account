/**
 * server/api/pitamai/mail/smtp-test.get.ts
 *
 * 認証済みユーザーの SMTP 設定が有効かどうかを検証するエンドポイント。
 * nodemailer の verify() を呼び出し、接続に成功した場合はアカウント情報を返す。
 */
import { createError } from 'h3';
import nodemailer from 'nodemailer';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  // ユーザーのメールアカウントを取得（認証済み）
  const account = await requireMailAccountForUser({ event });

  // データベース上の暗号化パスワードを復号
  const password = await decryptMailPassword({
    ciphertext: account.encryptedPassword,
    iv: account.encryptionIv,
    authTag: account.encryptionAuthTag,
  });

  // nodemailer トランスポーターを構築
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: {
      user: account.username,
      pass: password,
    },
  });

  try {
    // 接続確認
    await transporter.verify();

    return {
      ok: true,
      account: {
        emailAddress: account.emailAddress,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpSecure: account.smtpSecure,
      },
    };
  } catch {
    // 検証失敗時は 400 エラーを返す
    throw createError({
      statusCode: 400,
      message: 'SMTPサーバーへの接続に失敗しました',
    });
  }
});
