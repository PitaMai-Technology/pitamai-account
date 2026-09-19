import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

/**
 * 管理ユーザー一覧に、このアプリ固有の登録申請情報を付けて返す API。
 *
 * ユーザー一覧そのものは Better Auth の `auth.api.listUsers` を使う。
 * `registrationRequest` は Better Auth の責務ではないため、この API でだけ結合する。
 *
 * 画面からの呼び出し例:
 *
 * @example
 * ```ts
 * const data = await $fetch('/api/pitamai/admin-users', {
 *   query: { limit: 20, offset: 0 },
 * })
 *
 * console.log(data.users[0]?.registrationRequest)
 * ```
 *
 * 単純なユーザー選択欄など、登録申請情報が不要な場所ではこの API を使わず、
 * `authClient.admin.listUsers()` を直接使う。
 */

const AdminUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async event => {
  // limit は Better Auth の上限に合わせて最大100件に制限する。
  // z.coerce により URL クエリの文字列を number に変換できる。
  const query = await getValidatedQuery(event, value =>
    AdminUsersQuerySchema.parse(value)
  );
  const result = await auth.api.listUsers({
    query,
    headers: event.headers,
  });

  // listUsers は admin プラグイン側で user:list 権限を確認する。
  // ここで Prisma の user を直接一覧取得すると、その権限チェックを迂回するので避ける。

  // 新しいデータは registrationRequestId で結び、古いデータは email で補完する。
  // 先に必要なキーをまとめ、申請テーブルへの問い合わせを1回で済ませる。
  const emails = result.users
    .map(user => user.email)
    .filter((email): email is string => Boolean(email));
  const requestIds = result.users
    .map(user => user.registrationRequestId)
    .filter((id): id is string => typeof id === 'string');
  const requests = await prisma.registrationRequest.findMany({
    where: {
      OR: [{ email: { in: emails } }, { id: { in: requestIds } }],
    },
    select: { id: true, status: true, email: true },
  });

  return {
    ...result,
    users: result.users.map(user => {
      // ID を優先する。同じメールアドレスの過去申請が残っていても、
      // 現在のユーザーに明示的に紐づいた申請を選べるため。
      const request =
        requests.find(item => item.id === user.registrationRequestId) ??
        requests.find(item => item.email === user.email);

      return {
        ...user,
        registrationRequest: request
          ? { id: request.id, status: request.status }
          : null,
      };
    }),
  };
});
