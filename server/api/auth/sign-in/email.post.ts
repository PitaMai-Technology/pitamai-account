import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import * as z from 'zod';

const signInSchema = z.object({
  email: z.email('(サーバー)有効なメールアドレスを入力してください'),
  password: z.string('(サーバー)パスワードを入力してください').min(8, 'パスワードは8文字以上です。'),
  rememberMe: z.boolean().optional(),
  callbackURL: z.url().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const result = signInSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    // 認証情報を全ヘッダーごと渡す（create.post.tsと同様）
    const { headers } = event;
    const data = await auth.api.signInEmail({
      body: validated,
      headers,
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Sign-in(login) error:', e);
      throw createError({ statusCode: 400, message: 'メールアドレスまたはパスワードが正しくありません' });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});