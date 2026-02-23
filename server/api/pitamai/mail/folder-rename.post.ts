import { createError, readBody } from 'h3';
import { z } from 'zod';
import { listMailboxes, renameCustomMailbox } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

const bodySchema = z.object({
  path: z.string().min(1),
  newName: z.string().min(1),
});

export default defineEventHandler(async event => {
  const account = await requireMailAccountForUser({ event });
  const body = await readBody(event);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  await renameCustomMailbox({
    account,
    path: parsed.data.path,
    newName: parsed.data.newName,
  });

  const mailboxes = await listMailboxes(account);

  return {
    ok: true,
    mailboxes,
  };
});
