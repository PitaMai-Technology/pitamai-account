import { createError, getRouterParam } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { logAuditWithSession } from '~~/server/utils/audit';

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

  const request = await prisma.registrationRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw createError({
      statusCode: 404,
      message: '申請が見つかりません',
    });
  }

  if (request.status !== 'rejected') {
    throw createError({
      statusCode: 409,
      message: '却下済みの申請のみ再審査に戻せます',
    });
  }

  const updatedRequest = await prisma.registrationRequest.update({
    where: { id: request.id },
    data: {
      status: 'pending',
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    },
  });

  await logAuditWithSession(event, {
    action: 'REGISTRATION_REQUEST_RESTORED',
    targetId: updatedRequest.id,
    details: {
      email: updatedRequest.email,
    },
  });

  return {
    success: true,
    request: updatedRequest,
  };
});
