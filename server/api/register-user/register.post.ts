import { createError, readBody } from 'h3';
import prisma from '~~/lib/prisma';
import { registerRequestSchema } from '~~/shared/types/register-request';
import { recordAuditLog } from '~~/server/utils/audit';

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const parsed = registerRequestSchema.safeParse(body);

  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: '入力内容を確認してください',
    });
  }

  const { email, name, age, discordId, agreedToTerms } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'メールアドレスでエラーが発生しました。(409)',
    });
  }

  let request;
  try {
    request = await prisma.registrationRequest.create({
      data: {
        email: normalizedEmail,
        name,
        age,
        discordId,
        agreedToTerms,
        status: 'pending',
      },
    });
  } catch (error: any) {
    if (error?.code !== 'P2002') {
      throw error;
    }

    const existingRequest = await prisma.registrationRequest.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, status: true },
    });

    if (!existingRequest) {
      throw createError({
        statusCode: 409,
        message: 'メールアドレスでエラーが発生しました。(409)',
      });
    }

    if (existingRequest.status === 'pending') {
      throw createError({
        statusCode: 409,
        message: 'メールアドレスでエラーが発生しました。(409-2)',
      });
    }

    request = await prisma.registrationRequest.update({
      where: { email: normalizedEmail },
      data: {
        name,
        age,
        discordId,
        agreedToTerms,
        status: 'pending',
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      },
    });
  }

  await recordAuditLog({
    action: 'REGISTRATION_REQUEST_CREATED',
    targetId: request.id,
    details: {
      email: normalizedEmail,
      name,
      age,
      discordId,
      agreedToTerms,
    },
    event,
  });

  return {
    success: true,
    request: {
      id: request.id,
      email: request.email,
      status: request.status,
    },
  };
});
