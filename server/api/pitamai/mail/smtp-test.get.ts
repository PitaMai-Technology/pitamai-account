import { createError } from 'h3';
import nodemailer from 'nodemailer';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

export default defineEventHandler(async event => {
  const account = await requireMailAccountForUser({ event });

  const password = decryptMailPassword({
    ciphertext: account.encryptedPassword,
    iv: account.encryptionIv,
    authTag: account.encryptionAuthTag,
  });

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
    throw createError({
      statusCode: 400,
      message: 'SMTPサーバーへの接続に失敗しました',
    });
  }
});
