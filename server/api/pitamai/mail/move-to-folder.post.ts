import { createError, readBody } from 'h3';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { moveMessageToFolder } from '~~/server/utils/imap';

const bodySchema = z.object({
  fromFolder: z.string().min(1),
  toFolder: z.string().min(1),
  uid: z.number().int().min(1),
});

export default defineEventHandler(async event => {
  const account = await requireMailAccountForUser({ event });
  const body = await readBody(event);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  const result = await moveMessageToFolder({
    account,
    fromFolder: parsed.data.fromFolder,
    toFolder: parsed.data.toFolder,
    uid: parsed.data.uid,
  });

  return { ok: true, result };
});
