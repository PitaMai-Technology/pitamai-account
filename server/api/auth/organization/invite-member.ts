import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { logAuditWithSession } from '~~/server/utils/audit';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);
    const body = await readBody(event);
    const result = InviteMemberForm.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (!user) {
      logger.warn(`invite-member: user not found for email=${validated.email}`);
      throw createError({
        statusCode: 404,
        message:
          'このメールアドレスに紐づくアカウントは存在しません。事前にアカウント登録（事前登録）を行ってください。',
      });
    }

    const { headers } = event;
    const data = await auth.api.createInvitation({
      body: validated,
      headers,
    });

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'MEMBER_INVITE',
      targetId: user.id, // 招待されたユーザーID
      organizationId: validated.organizationId,
      details: {
        email: validated.email,
        role: validated.role,
      },
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Organization creation error');
      throw createError({
        statusCode: 400,
        message: '招待に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
