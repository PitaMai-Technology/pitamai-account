import { createError, readBody } from 'h3';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
import {
  requireMailAccountForUser,
  requireSessionUser,
} from '~~/server/utils/mail-account';
import { appendToSentMailbox } from '~~/server/utils/imap';
import { logger } from '~~/server/utils/logger';
import {
  createEncryptedMessage,
  createSignedMessage,
  decryptGpgPrivateKey,
  fetchPublicKeyFromKeyServer,
} from '~~/server/utils/mail-gpg';
import prisma from '~~/lib/prisma';

const bodySchema = z
  .object({
    to: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().default(''),
    text: z.string().optional(),
    html: z.string().optional(),
    sign: z.boolean().optional(),
    encrypt: z.boolean().optional(),
    attachments: z
      .array(
        z.object({
          filename: z.string().min(1),
          contentType: z.string().min(1),
          contentBase64: z.string().min(1),
        })
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    const hasTo = !!value.to?.trim();
    const hasCc = !!value.cc?.trim();
    const hasBcc = !!value.bcc?.trim();

    if (!hasTo && !hasCc && !hasBcc) {
      ctx.addIssue({
        code: 'custom',
        message: 'To/Cc/Bcc のいずれかを入力してください',
        path: ['to'],
      });
    }
  });

export default defineEventHandler(async event => {
  const [account, user] = await Promise.all([
    requireMailAccountForUser({ event }),
    requireSessionUser(event),
  ]);
  const body = await readBody(event);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  const to = parsed.data.to?.trim() || undefined;
  const cc = parsed.data.cc?.trim() || undefined;
  const bcc = parsed.data.bcc?.trim() || undefined;

  const extractEmails = (value?: string) =>
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const matched = item.match(/<([^>]+)>/);
        return (matched?.[1] ?? item).trim().toLowerCase();
      });

  const recipients = Array.from(
    new Set([...extractEmails(to), ...extractEmails(cc), ...extractEmails(bcc)])
  );

  // GPG 署名
  let finalText = parsed.data.text ?? '';
  let isSigned = false;
  let isEncrypted = false;

  if (parsed.data.sign) {
    const gpgRecord = await prisma.userGpgKey.findUnique({
      where: { userId: user.id },
      select: {
        encryptedPrivateKey: true,
        encryptionIv: true,
        encryptionAuthTag: true,
      },
    });

    if (!gpgRecord) {
      throw createError({
        statusCode: 400,
        message:
          'GPG 鍵が登録されていません。設定ページで鍵ペアを作成してください。',
      });
    }

    const armoredPrivateKey = decryptGpgPrivateKey({
      ciphertext: gpgRecord.encryptedPrivateKey,
      iv: gpgRecord.encryptionIv,
      authTag: gpgRecord.encryptionAuthTag,
    });

    finalText = await createSignedMessage({
      text: finalText,
      armoredPrivateKey,
    });
    isSigned = true;
  }

  // GPG 暗号化（受信者公開鍵）
  if (parsed.data.encrypt) {
    if (recipients.length === 0) {
      throw createError({
        statusCode: 422,
        message: '暗号化送信には宛先が必要です',
      });
    }

    const recipientKeys = await prisma.userGpgKey.findMany({
      where: {
        email: {
          in: recipients,
        },
      },
      select: {
        email: true,
        publicKey: true,
      },
    });

    const keyMap = new Map(
      recipientKeys.map(item => [item.email.toLowerCase(), item.publicKey])
    );

    let missingRecipients = recipients.filter(email => !keyMap.has(email));

    if (missingRecipients.length > 0) {
      const onlineResolved = await Promise.all(
        missingRecipients.map(async email => {
          const publicKey = await fetchPublicKeyFromKeyServer(email);
          return { email, publicKey };
        })
      );

      for (const item of onlineResolved) {
        if (item.publicKey) {
          keyMap.set(item.email, item.publicKey);
        }
      }

      missingRecipients = recipients.filter(email => !keyMap.has(email));
    }

    if (missingRecipients.length > 0) {
      throw createError({
        statusCode: 400,
        message: `公開鍵が見つからない宛先があります（システム登録/公開鍵サーバー未登録）: ${missingRecipients.join(', ')}`,
      });
    }

    // 送信済みフォルダからも復号できるよう、送信者（自分）の公開鍵も暗号化対象に含める。
    const senderKeyRecord = await prisma.userGpgKey.findUnique({
      where: { userId: user.id },
      select: {
        publicKey: true,
      },
    });

    if (!senderKeyRecord?.publicKey) {
      throw createError({
        statusCode: 400,
        message:
          '暗号化送信には送信者自身の公開鍵が必要です。設定ページでGPG鍵を再登録してください。',
      });
    }

    const recipientPublicKeys = recipients
      .map(email => keyMap.get(email))
      .filter((key): key is string => !!key);

    if (!recipientPublicKeys.includes(senderKeyRecord.publicKey)) {
      recipientPublicKeys.push(senderKeyRecord.publicKey);
    }

    finalText = await createEncryptedMessage({
      text: finalText,
      armoredPublicKeys: recipientPublicKeys,
    });

    isEncrypted = true;
  }

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

    const mailOptions = {
      from: account.username,
      sender: account.username,
      to,
      cc,
      bcc,
      subject: parsed.data.subject,
      text: finalText,
      html: isSigned || isEncrypted ? undefined : parsed.data.html,
      attachments: (parsed.data.attachments ?? []).map(item => ({
        filename: item.filename,
        contentType: item.contentType,
        content: Buffer.from(item.contentBase64, 'base64'),
      })),
    };

    const result = await transporter.sendMail(mailOptions);

    const accepted = Array.isArray(result.accepted)
      ? result.accepted.filter(item => !!item)
      : [];
    const rejected = Array.isArray(result.rejected)
      ? result.rejected.filter(item => !!item)
      : [];
    const pending = Array.isArray(result.pending)
      ? result.pending.filter(item => !!item)
      : [];

    if (accepted.length === 0 || rejected.length > 0 || pending.length > 0) {
      const details = [
        rejected.length > 0 ? `rejected=${rejected.join(',')}` : null,
        pending.length > 0 ? `pending=${pending.join(',')}` : null,
      ]
        .filter((item): item is string => !!item)
        .join(' ');

      throw createError({
        statusCode: 400,
        message: details
          ? `メールサーバーに受理されませんでした (${details})`
          : 'メールサーバーに受理されませんでした',
      });
    }

    const rawMessage = await new MailComposer(mailOptions).compile().build();
    const sentStoreResult = await appendToSentMailbox({
      account,
      rawMessage,
    });

    return {
      ok: true,
      messageId: result.messageId,
      accepted,
      sentStored: sentStoreResult.stored,
      sentMailbox: sentStoreResult.mailbox,
      isSigned,
      isEncrypted,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        accountId: account.id,
        to,
        cc,
        bcc,
      },
      'SMTP send failed'
    );

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    throw createError({
      statusCode: 400,
      message: 'メール送信に失敗しました（SMTPサーバーに受理されませんでした）',
    });
  }
});
