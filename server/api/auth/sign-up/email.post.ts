import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import * as z from 'zod';

const signUpSchema = z.object({
  name: z.string('(サーバー)名前を入力してください').min(2, '名前は2文字以上です。'),
  email: z.email('(サーバー)有効なメールアドレスを入力してください'),
  password: z.string('(サーバー)パスワードを入力してください').min(8, 'パスワードは8文字以上です。'),
  image: z.url().optional(),
  callbackURL: z.url().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const result = signUpSchema.safeParse(body);

    if (!result.success) {
      // バリデーションエラーを返す（statusMessage の代わりに message を使用）
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    const data = await auth.api.signUpEmail({
      body: validated,
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Sign-up error:', e);
      throw createError({ statusCode: 401, message: "メールアドレスまたはパスワードが正しくありません" });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});