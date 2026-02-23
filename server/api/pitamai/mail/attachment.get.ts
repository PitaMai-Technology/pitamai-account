import { createError, getQuery, setHeader } from 'h3';
import { z } from 'zod';
import { getMessageAttachment } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  folder: z.string().min(1),
  uid: z.coerce.number().int().min(1),
  index: z.coerce.number().int().min(0),
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

  const attachment = await getMessageAttachment({
    account,
    folder: parsed.data.folder,
    uid: parsed.data.uid,
    index: parsed.data.index,
  });

  const filename = attachment.filename ?? 'attachment';
  const safeFilename = encodeURIComponent(filename).replace(/%20/g, '+');

  setHeader(
    event,
    'Content-Type',
    attachment.contentType || 'application/octet-stream'
  );
  setHeader(
    event,
    'Content-Disposition',
    `inline; filename*=UTF-8''${safeFilename}`
  );

  return attachment.content;
});
