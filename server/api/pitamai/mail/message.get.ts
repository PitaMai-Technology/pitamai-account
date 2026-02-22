import { createError, getQuery } from 'h3';
import { z } from 'zod';
import { getMessageDetail } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { sanitizeMailHtml } from '~~/server/utils/mail-sanitize';

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  folder: z.string().min(1).default('INBOX'),
  uid: z.coerce.number().int().min(1),
});

export default defineEventHandler(async event => {
  const parsed = querySchema.safeParse(getQuery(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  const account = await requireMailAccountForUser({
    event,
    accountId: parsed.data.accountId,
  });

  const message = await getMessageDetail({
    account,
    folder: parsed.data.folder,
    uid: parsed.data.uid,
  });

  return {
    accountId: account.id,
    folder: parsed.data.folder,
    message: {
      ...message,
      html: message.html ? sanitizeMailHtml(message.html) : null,
    },
  };
});
