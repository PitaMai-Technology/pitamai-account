import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  await assertActiveMemberRole(event, ['owner']);
  try {
    const body = await readBody(event);
    const result = organizationCreateSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    // 認証情報を全ヘッダーごと渡す（better-auth公式推奨）
    const { headers } = event;
    const data = await auth.api.createOrganization({
      body: validated,
      headers,
    });
    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Organization creation error:', e);
      throw createError({
        statusCode: 400,
        message: '組織の作成に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
