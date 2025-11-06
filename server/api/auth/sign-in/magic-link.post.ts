import { auth } from '../../../utils/auth';
import { z } from 'zod';

const magicLinkSchema = z.object({
  email: z.email('（サーバー）有効なメールアドレスを入力してください'),
  name: z.string().optional(),
  callbackURL: z.string().optional(),
  newUserCallbackURL: z.string().optional(),
  errorCallbackURL: z.string().optional(),
});

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);

    // zodでバリデーション
    const validatedData = magicLinkSchema.parse(body);

    // Better Authのマジックリンク送信APIを呼び出し
    const headers = getHeaders(event);
    const data = await auth.api.signInMagicLink({
      body: {
        email: validatedData.email,
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.callbackURL && {
          callbackURL: validatedData.callbackURL,
        }),
        ...(validatedData.newUserCallbackURL && {
          newUserCallbackURL: validatedData.newUserCallbackURL,
        }),
        ...(validatedData.errorCallbackURL && {
          errorCallbackURL: validatedData.errorCallbackURL,
        }),
      },
      headers: headers as HeadersInit,
    });

    return {
      success: true,
      message: 'マジックリンクを送信しました。メールを確認してください。',
      email: validatedData.email,
      data,
    };
  } catch (error) {
    console.error('Magic link error:', error);

    // zodのバリデーションエラーの処理
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        message:
          error.issues[0]?.message || 'バリデーションエラーが発生しました',
      });
    }

    const err = error as { statusCode?: number; message?: string };
    throw createError({
      statusCode: err?.statusCode || 500,
      message:
        err?.message ||
        'マジックリンクの送信に失敗しました。もう一度お試しください。',
    });
  }
});
