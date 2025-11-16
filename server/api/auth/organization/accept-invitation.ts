import { auth } from '~~/server/utils/auth';
import { readBody, createError, sendRedirect } from 'h3';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    // shared/types/auth.ts から自動インポートされる
    const result = acceptInvitationSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = result.data;

    // 認証情報を全ヘッダーごと渡す(create.post.tsと同様)
    const { headers } = event;
    const data = await auth.api.acceptInvitation({
      body: validated,
      headers,
    });
    // 成功したら /verify にリダイレクト（POST → GET は 303 を使用）
    await sendRedirect(event, '/apps/dashboard', 303);
    return data;
  } catch (e: unknown) {
    console.error('Sign-in(login) error raw:', e);
    try {
      console.error('Sign-in(login) error json:', JSON.stringify(e));
    } catch {
      // JSON.stringify できない場合の保険
    }

    if (e instanceof Error) {
      console.error(
        'Sign-in(login) by accept-invitation error message:',
        e.message
      );
      console.error(
        'Sign-in(login) by accept-invitation error stack:',
        e.stack
      );
      throw createError({
        statusCode: 400,
        message: '招待の承認に失敗しました',
      });
    }

    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
