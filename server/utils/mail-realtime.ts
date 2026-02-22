import type { MailAccount } from '@prisma/client';
import { createImapClient } from '~~/server/utils/imap';
import { logger } from '~~/server/utils/logger';

type MailAccountConnection = Pick<
  MailAccount,
  | 'id'
  | 'imapHost'
  | 'imapPort'
  | 'imapSecure'
  | 'username'
  | 'encryptedPassword'
  | 'encryptionIv'
  | 'encryptionAuthTag'
>;

type MailRealtimeEvent =
  | { type: 'ready'; accountId: string; folder: string }
  | { type: 'heartbeat'; accountId: string; folder: string; at: string }
  | {
      type: 'new-mail';
      accountId: string;
      folder: string;
      exists: number;
      previousExists: number;
      at: string;
    }
  | { type: 'error'; accountId: string; message: string; at: string };

type Subscriber = (event: MailRealtimeEvent) => void;

type Watcher = {
  account: MailAccountConnection;
  folder: string;
  subscribers: Set<Subscriber>;
  running: boolean;
  stopRequested: boolean;
  existsCount: number;
};

const watchers = new Map<string, Watcher>();

function keyOf(account: MailAccountConnection, folder: string) {
  return `${account.id}:${folder}`;
}

function broadcast(watcher: Watcher, event: MailRealtimeEvent) {
  watcher.subscribers.forEach(subscriber => {
    try {
      subscriber(event);
    } catch {
      // ignore subscriber errors
    }
  });
}

async function runWatcher(watcher: Watcher) {
  const client = createImapClient(watcher.account);
  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;

  try {
    await client.connect();
    lock = await client.getMailboxLock(watcher.folder);
    const mailbox = await client.mailboxOpen(watcher.folder);
    watcher.existsCount = mailbox.exists;

    broadcast(watcher, {
      type: 'ready',
      accountId: watcher.account.id,
      folder: watcher.folder,
    });

    const onExists = (data: unknown) => {
      try {
        const payload =
          data && typeof data === 'object'
            ? (data as { count?: number; prevCount?: number })
            : { count: undefined, prevCount: undefined };

        const count = payload.count ?? watcher.existsCount;
        const prevCount = payload.prevCount ?? watcher.existsCount;

        if (count > prevCount) {
          broadcast(watcher, {
            type: 'new-mail',
            accountId: watcher.account.id,
            folder: watcher.folder,
            exists: count,
            previousExists: prevCount,
            at: new Date().toISOString(),
          });
        } else {
          broadcast(watcher, {
            type: 'heartbeat',
            accountId: watcher.account.id,
            folder: watcher.folder,
            at: new Date().toISOString(),
          });
        }

        watcher.existsCount = count;
      } catch {
        // ignore event handler errors
      }
    };

    client.on('exists', onExists);

    while (!watcher.stopRequested) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    client.off('exists', onExists);
  } catch (error) {
    logger.error(
      { err: error, accountId: watcher.account.id },
      'mail realtime watcher failed'
    );
    broadcast(watcher, {
      type: 'error',
      accountId: watcher.account.id,
      message: 'mail watcher error',
      at: new Date().toISOString(),
    });
  } finally {
    watcher.running = false;

    if (lock) {
      lock.release();
    }

    if (client.usable) {
      await client.logout().catch(() => {});
    }

    if (watcher.subscribers.size === 0) {
      watchers.delete(keyOf(watcher.account, watcher.folder));
    }
  }
}

export function subscribeMailRealtime(params: {
  account: MailAccountConnection;
  folder: string;
  subscriber: Subscriber;
}) {
  const key = keyOf(params.account, params.folder);
  const existing = watchers.get(key);

  const watcher =
    existing ??
    ({
      account: params.account,
      folder: params.folder,
      subscribers: new Set<Subscriber>(),
      running: false,
      stopRequested: false,
      existsCount: 0,
    } satisfies Watcher);

  watcher.subscribers.add(params.subscriber);

  if (!existing) {
    watchers.set(key, watcher);
  }

  if (!watcher.running) {
    watcher.running = true;
    watcher.stopRequested = false;
    void runWatcher(watcher);
  }

  return () => {
    watcher.subscribers.delete(params.subscriber);
    if (watcher.subscribers.size === 0) {
      watcher.stopRequested = true;
    }
  };
}
