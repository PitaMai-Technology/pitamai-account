// TypeScript
import { auth } from '~~/server/utils/auth';
import { createError, getQuery } from 'h3';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    // shared/types/member.ts から自動インポートされる
    const result = ListMembers.safeParse(query);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const validated = { ...result.data } as Record<string, unknown>;

    // クライアント側で送られてくるフラットなフィールド名を
    // Better Auth が期待するネストされたフィールド名にマッピングする
    const fieldMap: Record<string, string> = {
      email: 'user.email',
      name: 'user.name',
    };

    if (
      typeof validated.filterField === 'string' &&
      fieldMap[validated.filterField]
    ) {
      validated.filterField = fieldMap[validated.filterField];
    }

    // 認証情報を全ヘッダーごと渡す（better-auth公式推奨）
    const { headers } = event;

    return await auth.api.listMembers({
      query: validated,
      headers,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('List members error:', e);
      throw createError({
        statusCode: 400,
        message: 'メンバー一覧の取得に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
