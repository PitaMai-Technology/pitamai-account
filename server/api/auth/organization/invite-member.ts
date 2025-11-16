import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const result = InviteMemberForm.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

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
