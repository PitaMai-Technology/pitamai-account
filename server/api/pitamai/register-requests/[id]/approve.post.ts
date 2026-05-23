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

  if (request.status !== 'pending') {
    throw createError({
      statusCode: 409,
      message: 'すでに審査済みです',
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: request.email },
    select: { id: true },
  });

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'このメールアドレスはすでにユーザー登録されています',
    });
  }

  const fakePassword = `${globalThis.crypto.randomUUID()}!aA1`;
  const createdFromAuth = (await auth.api.createUser({
    body: {
      email: request.email,
      name: request.name,
      password: fakePassword,
      role: 'member',
      data: {
        twitterUrl: null,
        bio: null,
      },
    },
    headers: event.headers,
  })) as { user?: { id?: string } };

  const userId = createdFromAuth.user?.id;
  if (!userId) {
    throw createError({
      statusCode: 500,
      message: 'ユーザー作成に失敗しました',
    });
  }

  let updatedRequest;
  try {
    updatedRequest = await prisma.$transaction(async transaction => {
      return await transaction.registrationRequest.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          reviewedBy: session?.user.id,
          rejectionReason: null,
        },
      });
    });
  } catch (updateError) {
    try {
      await auth.api.removeUser({
        body: {
          userId: createdFromAuth.user?.id,
        },
        headers: event.headers,
      });
    } catch (rollbackError) {
      console.error('Failed to rollback created auth user', {
        userId: createdFromAuth.user?.id,
        rollbackError,
      });
    }

    throw updateError;
  }

  await recordAuditLog({
    userId: session?.user.id,
    action: 'REGISTRATION_REQUEST_APPROVED',
    targetId: updatedRequest.id,
    details: {
      email: updatedRequest.email,
      approvedUserId: userId,
    },
    event,
  });

  return {
    success: true,
    request: updatedRequest,
    userId,
  };
});
