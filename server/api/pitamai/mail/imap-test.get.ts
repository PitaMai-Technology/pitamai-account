import { createError, getQuery } from 'h3';
import { z } from 'zod';
import { listMailboxes } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
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

  const mailboxes = await listMailboxes(account);

  return {
    ok: true,
    account: {
      id: account.id,
      emailAddress: account.emailAddress,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapSecure,
    },
    mailboxes,
  };
});
