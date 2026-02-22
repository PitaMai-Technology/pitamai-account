import { createError, readBody } from 'h3';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { appendToSentMailbox } from '~~/server/utils/imap';
import { logger } from '~~/server/utils/logger';

const bodySchema = z
  .object({
    to: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().default(''),
    text: z.string().optional(),
    html: z.string().optional(),
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
  const account = await requireMailAccountForUser({ event });
  const body = await readBody(event);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  const to = parsed.data.to?.trim() || undefined;
  const cc = parsed.data.cc?.trim() || undefined;
  const bcc = parsed.data.bcc?.trim() || undefined;

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
      text: parsed.data.text,
      html: parsed.data.html,
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
