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

  // 1. 現在そのメールアドレスを使用しているユーザーがいるかチェック
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'メールアドレス周りでのエラーが発生しました。(409-1)',
    });
  }

  // 2. そのメールアドレスの過去の申請をチェック
  const existingRequest = await prisma.registrationRequest.findUnique({
    where: { email: normalizedEmail },
    include: { user: true },
  });

  // もし既に承認済みの申請があり、かつユーザーが紐付いている場合、
  // そのユーザーがメールアドレスを変更していたとしても、
  // 「このメールアドレスからの申請は既に完了している（アカウントが存在する）」とみなして拒否します。
  if (
    existingRequest &&
    existingRequest.status === 'approved' &&
    existingRequest.user
  ) {
    throw createError({
      statusCode: 409,
      message: 'メールアドレス周りでのエラーが発生しました。(409-2)',
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

    // registrationRequest.create で P2002 (Unique constraint) が出たということは
    // email が既に存在することを意味します（findUnique ですでにチェックしていますが、
    // レースコンディション対策として catch 内でも処理します）

    const latestRequest = await prisma.registrationRequest.findUnique({
      where: { email: normalizedEmail },
      include: { user: true },
    });

    if (latestRequest?.status === 'pending') {
      throw createError({
        statusCode: 409,
        message: 'メールアドレス周りでのエラーが発生しました。(409-3)',
      });
    }

    if (latestRequest?.status === 'approved' && latestRequest.user) {
      throw createError({
        statusCode: 409,
        message: 'メールアドレス周りでのエラーが発生しました。(409-2)',
      });
    }

    // 承認済みだがユーザーがいない、あるいは却下済みの場合は、既存の申請を更新して再申請
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
