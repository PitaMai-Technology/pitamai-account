import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import prisma from '~~/lib/prisma';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admin', 'owner']);
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
      console.warn(
        `invite-member: user not found for email=${validated.email}`
      );
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
    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Organization creation error:', e);
      throw createError({
        statusCode: 400,
        message: '招待に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
