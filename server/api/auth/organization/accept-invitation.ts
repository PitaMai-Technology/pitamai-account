import { auth } from '~~/server/utils/auth';
import { readBody, createError, sendRedirect } from 'h3';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    // await assertActiveMemberRole(event, ['member', 'admin', 'owner']);

    const body = await readBody(event);
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
    // 成功したらダッシュボードにリダイレクト（POST → GETのため"HTTP: 303"を使用）
    await sendRedirect(event, '/apps/dashboard', 303);

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'MEMBER_ACCEPT_INVITATION',
      targetId: data?.member?.id, // 招待を承認したメンバーID
      details: {
        invitation: data?.invitation,
      },
    });

    return data;
  } catch (e: unknown) {
    logger.error(e, 'Sign-in(login) by accept-invitation failed');

    if (e instanceof Error) {
      throw createError({
        statusCode: 400,
        message: '招待の承認に失敗しました',
        cause: e,
      });
    }

    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
