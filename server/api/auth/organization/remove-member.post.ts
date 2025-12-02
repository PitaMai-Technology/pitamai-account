import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { RemoveMemberSchema } from '~~/shared/types/member-remove';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

type MemberRecord = { id: string };

const isMemberRecord = (v: unknown): v is MemberRecord => {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    typeof (v as Record<string, unknown>).id === 'string'
  );
};

const extractMembers = (res: unknown): MemberRecord[] => {
  if (Array.isArray(res)) {
    return res.filter(isMemberRecord);
  }
  if (typeof res === 'object' && res !== null) {
    const r = res as Record<string, unknown>;
    if (Array.isArray(r.members)) {
      return r.members.filter(isMemberRecord);
    }
  }
  return [];
};

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admins', 'owner']);

    const body = await readBody(event);
    console.debug('remove-member request body:', body);

    const parsed = RemoveMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { organizationId, memberIdOrEmail, memberId } = parsed.data;
    // normalize headers as a plain record to avoid any casts in calls to auth.api
    const headersObj =
      (event as unknown as { headers?: Record<string, string> }).headers ?? {};

    const idToSend = String(memberIdOrEmail ?? memberId);
    const payload = {
      memberIdOrEmail: idToSend,
      ...(organizationId ? { organizationId } : {}),
    };

    // サーバーでの自己削除を防ぐ：セッションのユーザーID/メールを解決
    console.debug('remove-member payload to auth.api:', payload);
    try {
      const session = await auth.api.getSession({ headers: headersObj });
      const currentUserId = session?.user?.id as string | undefined;
      const currentUserEmail = session?.user?.email as string | undefined;
      if (
        currentUserId &&
        (idToSend === currentUserId || idToSend === currentUserEmail)
      ) {
        throw createError({
          statusCode: 403,
          message: 'Cannot delete your own membership',
        });
      }
    } catch {
      // セッション取得エラーを無視して続行（認証されていない場合、auth.api呼び出しは後で失敗する）
    }

    // removeMemberを呼び出す小さなヘルパー
    const tryRemove = async (p: {
      memberIdOrEmail: string;
      organizationId?: string;
    }) => {
      return await auth.api.removeMember({ body: p, headers: headersObj });
    };

    try {
      return await tryRemove(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('auth.api.removeMember failed:', msg);

      // メールが見つからない場合のみフォールバックを試す
      if (
        organizationId &&
        idToSend.includes('@') &&
        msg.includes('Member not found')
      ) {
        try {
          const listRes = await auth.api.listMembers({
            query: {
              organizationId,
              filterField: 'user.email',
              filterOperator: 'eq',
              filterValue: idToSend,
            },
            headers: headersObj,
          });

          const members = extractMembers(listRes);
          const found = members[0];
          if (found) {
            console.debug(
              'メールでメンバーが見つかった、memberIdで削除を再試行：',
              found.id
            );
            return await tryRemove({
              memberIdOrEmail: found.id,
              organizationId,
            });
          }
        } catch (fallbackErr) {
          console.error(
            'フォールバックのメンバー削除検索に失敗：',
            fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr)
          );
        }
      }

      // フォールバックが成功しなかった場合、元のエラーを再スロー
      throw err;
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Remove member error:', e.message);
      throw createError({
        statusCode: 400,
        message: 'メンバーの削除に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
