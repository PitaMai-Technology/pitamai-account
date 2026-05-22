import { createError, getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { logAuditWithSession } from '~~/server/utils/audit';

const rejectSchema = z.object({
  rejectionReason: z.string().max(500).optional(),
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

  const requestId = getRouterParam(event, 'id');
  if (!requestId) {
    throw createError({
      statusCode: 400,
      message: '申請IDが必要です',
    });
  }

  const body = await readBody(event);
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: '入力内容を確認してください',
    });
  }

  const request = await prisma.registrationRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw createError({
      statusCode: 404,
      message: '申請が見つかりません',
    });
  }

  if (request.status !== 'pending') {
    throw createError({
      statusCode: 409,
      message: 'すでに審査済みです',
    });
  }

  const updatedRequest = await prisma.registrationRequest.update({
    where: { id: request.id },
    data: {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: session?.user.id,
      rejectionReason: parsed.data.rejectionReason?.trim() || null,
    },
  });

  await logAuditWithSession(event, {
    action: 'REGISTRATION_REQUEST_REJECTED',
    targetId: updatedRequest.id,
    details: {
      email: updatedRequest.email,
      rejectionReason: updatedRequest.rejectionReason,
    },
  });

  return {
    success: true,
    request: updatedRequest,
  };
});
