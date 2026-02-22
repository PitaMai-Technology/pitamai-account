import { createError, createEventStream, getQuery } from 'h3';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { createImapClient } from '~~/server/utils/imap';
import { logger } from '~~/server/utils/logger';

const querySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
});

export default defineEventHandler(async event => {
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  const account = await requireMailAccountForUser({ event });
  const stream = createEventStream(event);
  const client = createImapClient(account);
  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
  let existsCount = 0;
  let closed = false;

  const heartbeat = setInterval(() => {
    stream.push({
      event: 'heartbeat',
      data: JSON.stringify({
        at: new Date().toISOString(),
        folder: parsed.data.folder,
      }),
    });
  }, 15000);

  const onExists = (payload: unknown) => {
    try {
      const data =
        payload && typeof payload === 'object'
          ? (payload as { count?: number; prevCount?: number })
          : {};

      const nextCount = data.count ?? existsCount;
      const prevCount = data.prevCount ?? existsCount;

      existsCount = nextCount;

      if (nextCount > prevCount) {
        stream.push({
          event: 'new-mail',
          data: JSON.stringify({
            type: 'new-mail',
            accountId: account.id,
            folder: parsed.data.folder,
            exists: nextCount,
            previousExists: prevCount,
            at: new Date().toISOString(),
          }),
        });
      }
    } catch (error) {
      logger.error(
        { err: error, accountId: account.id },
        'SSE exists handler failed'
      );
    }
  };

  try {
    await client.connect();
    lock = await client.getMailboxLock(parsed.data.folder);
    const mailbox = await client.mailboxOpen(parsed.data.folder);
    existsCount = mailbox.exists;

    client.on('exists', onExists);

    const idleLoop = async () => {
      while (!closed) {
        try {
          await client.idle();
        } catch {
          if (!closed) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
    };

    void idleLoop();
  } catch (error) {
    clearInterval(heartbeat);
    if (lock) {
      lock.release();
    }
    if (client.usable) {
      await client.logout().catch(() => {});
    }

    logger.error(
      { err: error, accountId: account.id },
      'Failed to initialize SSE stream'
    );
    throw createError({
      statusCode: 400,
      message: 'リアルタイム接続の初期化に失敗しました',
    });
  }

  stream.onClosed(async () => {
    closed = true;
    clearInterval(heartbeat);
    client.off('exists', onExists);
    if (lock) {
      lock.release();
    }
    if (client.usable) {
      await client.logout().catch(() => {});
    }
    await stream.close();
  });

  stream.push({
    event: 'connected',
    data: JSON.stringify({
      accountId: account.id,
      folder: parsed.data.folder,
      at: new Date().toISOString(),
    }),
  });

  stream.push({
    event: 'ready',
    data: JSON.stringify({
      type: 'ready',
      accountId: account.id,
      folder: parsed.data.folder,
      exists: existsCount,
      at: new Date().toISOString(),
    }),
  });

  return stream.send();
});
