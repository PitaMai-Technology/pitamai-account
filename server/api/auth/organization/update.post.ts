import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { organizationUpdateSchema } from '~~/shared/types/organization-update';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const result = organizationUpdateSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { organizationId, data } = result.data;

    // 認証情報を全ヘッダーごと渡す
    const { headers } = event;
    const response = await auth.api.updateOrganization({
      body: {
        organizationId,
        data,
      },
      headers,
    });
    console.log('Organization update response:', response);

    return response;
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Organization update error:', e);
      throw createError({
        statusCode: 400,
        message: '組織の更新に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
