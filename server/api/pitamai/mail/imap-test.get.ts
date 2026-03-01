/**
 * server/api/pitamai/mail/imap-test.get.ts
 *
 * 現在の IMAP 接続情報でサーバへ接続し、利用可能なメールボックス一覧を
 * 取得するテスト用エンドポイント。
 * クライアントは任意で accountId を指定できる。
 */
import { createError, getQuery } from 'h3';
import { z } from 'zod';
import { logger } from '~~/server/utils/logger';
import { listMailboxes } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

// クエリのバリデーション: オプショナルな accountId
const querySchema = z.object({
  accountId: z.string().min(1).optional(),
});

export default defineEventHandler(async event => {
  try {
    // クエリパラメータ検証
    const parsed = querySchema.safeParse(getQuery(event));

    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    // アカウント解決
    const account = await requireMailAccountForUser({
      event,
      accountId: parsed.data.accountId,
    });

    // IMAP フォルダ一覧取得
    const mailboxes = await listMailboxes(account);

    // 情報を返却
    return {
      ok: true,
      account: {
        id: account.id,
        emailAddress: account.emailAddress,
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapSecure: account.imapSecure,
      },
      mailboxes,
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'IMAP test connection error');
      throw createError({
        statusCode: 400,
        message: 'IMAP接続テストに失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
