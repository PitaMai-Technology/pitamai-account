import { createError, getRouterParam } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';
import { recordAuditLog } from '~~/server/utils/audit';

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

  if (request.status === 'pending') {
    throw createError({
      statusCode: 409,
      message: '審査済みの申請のみ削除できます',
    });
  }

  const deletedRequest = await prisma.registrationRequest.delete({
    where: { id: request.id },
  });

  await recordAuditLog({
    userId: session?.user.id,
    action: 'REGISTRATION_REQUEST_DELETED',
    targetId: deletedRequest.id,
    details: {
      email: deletedRequest.email,
    },
    event,
  });

  return {
    success: true,
  };
});
