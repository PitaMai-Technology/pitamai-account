import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    // shared/types/auth.ts から自動インポートされる
    const result = magicLinkSignInSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    // 認証情報を全ヘッダーごと渡す(create.post.tsと同様)
    const { headers } = event;
    const data = await auth.api.signInMagicLink({
      body: validated,
      headers,
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Sign-in(login) by magicLink error');
      throw createError({
        statusCode: 400,
        message: 'メールアドレスが正しくありません',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
