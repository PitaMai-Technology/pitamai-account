import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';

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
      console.error('Sign-in(login) by magicLink error:', e);
      throw createError({
        statusCode: 400,
        message: 'メールアドレスが正しくありません',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
