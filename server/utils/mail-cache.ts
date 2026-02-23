import prisma from '~~/lib/prisma';

export type CachedMailListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  hasAttachment: boolean;
  seen: boolean;
};

type UpsertMessageInput = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  hasAttachment: boolean;
};

function splitFrom(from: string | null): {
  fromName: string | null;
  fromAddress: string | null;
} {
  if (!from) {
    return { fromName: null, fromAddress: null };
  }

  const matched = from.match(/^(.*)\s<([^>]+)>$/);
  if (!matched) {
    return { fromName: null, fromAddress: from };
  }

  return {
    fromName: matched[1]?.trim() || null,
    fromAddress: matched[2]?.trim() || null,
  };
}

function joinFrom(fromName: string | null, fromAddress: string | null) {
  if (fromName && fromAddress) {
    return `${fromName} <${fromAddress}>`;
  }
  return fromAddress ?? fromName ?? null;
}

export async function getCachedMessages(params: {
  accountId: string;
  folder: string;
  limit: number;
}): Promise<CachedMailListItem[]> {
  const rows = await prisma.mailCache.findMany({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
    orderBy: [{ uid: 'desc' }, { internalDate: 'desc' }],
    take: params.limit,
  });

  return rows.map(row => ({
    uid: row.uid,
    subject: row.subject,
    from: joinFrom(row.fromName, row.fromAddress),
    date: row.internalDate ? row.internalDate.toISOString() : null,
    hasAttachment: row.hasAttachment,
    seen: false,
  }));
}

export async function getMaxCachedUid(params: {
  accountId: string;
  folder: string;
}) {
  const max = await prisma.mailCache.aggregate({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
    _max: {
      uid: true,
    },
  });

  return max._max.uid ?? null;
}

export async function getCachedMessageCount(params: {
  accountId: string;
  folder: string;
}) {
  return prisma.mailCache.count({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
  });
}

export async function upsertMessagesToCache(params: {
  accountId: string;
  folder: string;
  messages: UpsertMessageInput[];
}) {
  if (params.messages.length === 0) return;

  await prisma.$transaction(
    params.messages.map(message => {
      const split = splitFrom(message.from);
      return prisma.mailCache.upsert({
        where: {
          accountId_folder_uid: {
            accountId: params.accountId,
            folder: params.folder,
            uid: message.uid,
          },
        },
        create: {
          accountId: params.accountId,
          folder: params.folder,
          uid: message.uid,
          subject: message.subject,
          fromName: split.fromName,
          fromAddress: split.fromAddress,
          hasAttachment: message.hasAttachment,
          internalDate: message.date ? new Date(message.date) : null,
          snippet: null,
        },
        update: {
          subject: message.subject,
          fromName: split.fromName,
          fromAddress: split.fromAddress,
          hasAttachment: message.hasAttachment,
          internalDate: message.date ? new Date(message.date) : null,
        },
      });
    })
  );
}

export async function pruneCache(params: {
  accountId: string;
  folder: string;
  keep: number;
}) {
  const stale = await prisma.mailCache.findMany({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
    orderBy: { uid: 'desc' },
    skip: params.keep,
    take: 1000,
    select: { id: true },
  });

  if (stale.length === 0) return;

  await prisma.mailCache.deleteMany({
    where: {
      id: {
        in: stale.map(item => item.id),
      },
    },
  });
}
