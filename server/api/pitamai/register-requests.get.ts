import { createError, getValidatedQuery } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
});

export default defineEventHandler(async event => {
  const session = await auth.api.getSession({ headers: event.headers });
  const role = session?.user?.role;

  if (role !== 'owner' && role !== 'admins') {
    throw createError({
      statusCode: 403,
      message: '権限がありません',
    });
  }

  const query = await getValidatedQuery(event, body => QuerySchema.parse(body));

  const where: Record<string, unknown> = {};

  const startAt = query.startAt ? new Date(query.startAt) : undefined;
  const endAt = query.endAt ? new Date(query.endAt) : undefined;

  if (startAt || endAt) {
    const gte = startAt ? new Date(startAt) : undefined;
    const lteBase = endAt ?? startAt;
    const lte = lteBase ? new Date(lteBase) : undefined;

    where.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  const [requests, total] = await Promise.all([
    prisma.registrationRequest.findMany({
      where,
      take: query.limit,
      skip: query.offset,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.registrationRequest.count({ where }),
  ]);

  return {
    requests,
    total,
  };
});
