import { createError, readBody } from 'h3';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { appendToDraftMailbox } from '~~/server/utils/imap';

const bodySchema = z.object({
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

  const draftHeaders: Record<string, string> = {};
  const recipientsMeta = Buffer.from(
    JSON.stringify({ to: to ?? null, cc: cc ?? null, bcc: bcc ?? null }),
    'utf8'
  ).toString('base64');

  draftHeaders['X-Pitamai-Draft-Recipients'] = recipientsMeta;
  if (to) draftHeaders['X-Draft-To'] = to;
  if (cc) draftHeaders['X-Draft-Cc'] = cc;
  if (bcc) draftHeaders['X-Draft-Bcc'] = bcc;

  const mailOptions = {
    from: account.username,
    sender: account.username,
    to,
    cc,
    bcc,
    headers: draftHeaders,
    subject: parsed.data.subject,
    text: parsed.data.text,
    html: parsed.data.html,
    attachments: (parsed.data.attachments ?? []).map(item => ({
      filename: item.filename,
      contentType: item.contentType,
      content: Buffer.from(item.contentBase64, 'base64'),
    })),
  };

  const rawMessage = await new MailComposer(mailOptions).compile().build();
  const result = await appendToDraftMailbox({
    account,
    rawMessage,
  });

  if (!result.stored) {
    throw createError({
      statusCode: 400,
      message: '下書きフォルダ(draft)が見つかりませんでした。',
    });
  }

  return {
    ok: true,
    stored: result.stored,
    mailbox: result.mailbox,
  };
});
