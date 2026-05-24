import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { RemoveMemberSchema } from '~~/shared/types/member-remove';
import { logger } from '~~/server/utils/logger';
import { logAuditWithSession } from '~~/server/utils/audit';

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
    const body = await readBody(event);
    const parsed = RemoveMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw createError({ statusCode: 422, message: 'Validation Error' });
    }

    const { organizationId, memberIdOrEmail, memberId } = parsed.data;

    // auth.api.removeMember に headers を渡すことで認可チェックが行われます
    // ただし、自己削除のチェックなど追加のロジックを継続します

    const idToSend = String(memberIdOrEmail ?? memberId);
    const payload = {
      memberIdOrEmail: idToSend,
      ...(organizationId ? { organizationId } : {}),
    };

    const session = await auth.api.getSession({ headers: event.headers });
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

    // 監査ログ記録
    await logAuditWithSession(event, {
      action: 'MEMBER_REMOVE',
      targetId: idToSend,
      organizationId: organizationId,
    });

    const tryRemove = async (p: {
      memberIdOrEmail: string;
      organizationId?: string;
    }) => {
      return await auth.api.removeMember({ body: p, headers: event.headers });
    };

    try {
      return await tryRemove(payload);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'statusCode' in err &&
        (err.statusCode === 401 || err.statusCode === 403)
      )
        throw err;

      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: msg }, 'auth.api.removeMember failed');

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
            headers: event.headers,
          });

          const members = extractMembers(listRes);
          const found = members[0];
          if (found) {
            return await tryRemove({
              memberIdOrEmail: found.id,
              organizationId,
            });
          }
        } catch (fallbackErr) {
          logger.error(fallbackErr, 'Fallback member removal failed');
        }
      }

      throw err;
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403))
        throw e;

      logger.error(e, 'Remove member error');
      throw createError({
        statusCode: 400,
        message: 'メンバーの削除に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
