import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['owner']);

    const body = await readBody(event);
    const result = organizationDeleteSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { organizationId } = result.data;

    const { headers } = event;
    const data = await auth.api.deleteOrganization({
      body: {
        organizationId,
      },
      headers,
    });
    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Organization deletion error:', e);
      throw createError({
        statusCode: 400,
        message: '組織の削除に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
