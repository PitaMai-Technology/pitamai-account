import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import prisma from '~~/lib/prisma';

/**
 * Better Auth 標準の権限チェックに加えて、このサービス固有の制約を適用する。
 *
 * ロールごとの許可範囲は `permissions.ts` が担当する。このファイルには
 * 「本人を組織から削除させない」など、ロールだけでは表現しにくい条件を書く。
 *
 * `server/utils/auth.ts` の plugins に登録済みなので、個別 API 側で呼び出す必要はない。
 *
 * 制約を追加するときは matcher で対象を限定してから APIError を投げる。
 *
 * @example
 * ```ts
 * {
 *   matcher: ctx => ctx.path === '/organization/update',
 *   handler: createAuthMiddleware(async ctx => {
 *     if (禁止条件) {
 *       throw new APIError('FORBIDDEN', { message: '変更できません。' })
 *     }
 *   }),
 * }
 * ```
 */

type OrganizationBody = {
  email?: string;
  organizationId?: string;
  memberIdOrEmail?: string;
};

export const authGuardsPlugin = () =>
  ({
    id: 'pitamai-auth-guards',
    hooks: {
      before: [
        {
          // このサービスでは、先にアカウントを作成した人だけを招待できる。
          // Better Auth の招待メール送信より前に確認するので、存在しない宛先へ
          // メールが飛ぶことも、不要な invitation が残ることもない。
          matcher: ctx => ctx.path === '/organization/invite-member',
          handler: createAuthMiddleware(async ctx => {
            const body = ctx.body as OrganizationBody;
            if (!body.email) return;

            const user = await prisma.user.findUnique({
              where: { email: body.email },
              select: { id: true },
            });

            if (!user) {
              throw new APIError('NOT_FOUND', {
                message: '招待先のアカウントが見つかりません。',
              });
            }
          }),
        },
        {
          // owner/admin が自分自身を削除すると、管理者不在になる可能性があるため禁止する。
          // Better Auth 側のロール判定は、このチェックとは別に通常どおり実行される。
          matcher: ctx => ctx.path === '/organization/remove-member',
          handler: createAuthMiddleware(async ctx => {
            const body = ctx.body as OrganizationBody;
            const memberIdOrEmail = body.memberIdOrEmail;
            if (!memberIdOrEmail) return;

            const session = await getSessionFromCtx(ctx);
            if (
              session?.user &&
              (memberIdOrEmail === session.user.id ||
                memberIdOrEmail === session.user.email)
            ) {
              throw new APIError('FORBIDDEN', {
                message: '自分自身を組織から削除することはできません。',
              });
            }

            if (!body.organizationId || !memberIdOrEmail.includes('@')) return;

            // remove-member は member ID を渡すのが最も確実。
            // 画面からメールアドレスが渡された場合だけ、ここで member ID に直してから
            // Better Auth 本体へ処理を渡す。
            const member = await prisma.member.findFirst({
              where: {
                organizationId: body.organizationId,
                user: { email: memberIdOrEmail },
              },
              select: { id: true },
            });
            if (!member) return;

            // before hook で body を差し替える場合は context 全体を返す。
            // ctx.body を直接書き換えず、新しいオブジェクトとして返しておく。
            return {
              context: {
                ...ctx,
                body: { ...body, memberIdOrEmail: member.id },
              },
            };
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
