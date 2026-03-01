/**
 * server/api/pitamai/mail/attachment.get.ts
 *
 * メールメッセージの添付ファイルを取り出し、バイナリとして返すエンドポイント。
 * クエリでフォルダ・UID・添付インデックスを受け取り、対応するデータを
 * IMAPサーバーから取得して適切なヘッダを付与して返却する。
 */
import { createError, getQuery, setHeader } from 'h3';
import { z } from 'zod';
import { logger } from '~~/server/utils/logger';
import { getMessageAttachment } from '~~/server/utils/imap';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';

// クエリパラメータの検証スキーマ。accountId はマルチアカウント対応のオプション。
const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  folder: z.string().min(1),
  uid: z.coerce.number().int().min(1),
  index: z.coerce.number().int().min(0),
});

export default defineEventHandler(async event => {
  try {
    // クエリ検証
    const parsed = querySchema.safeParse(getQuery(event));

    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    // 認証とアカウント取得
    const account = await requireMailAccountForUser({
      event,
      accountId: parsed.data.accountId,
    });

    // 添付ファイルを取得
    const attachment = await getMessageAttachment({
      account,
      folder: parsed.data.folder,
      uid: parsed.data.uid,
      index: parsed.data.index,
    });

    // ファイル名エンコード
    const filename = attachment.filename ?? 'attachment';
    const safeFilename = encodeURIComponent(filename).replace(/%20/g, '+');

    // 適切なレスポンスヘッダを設定
    setHeader(
      event,
      'Content-Type',
      attachment.contentType || 'application/octet-stream'
    );
    setHeader(
      event,
      'Content-Disposition',
      `inline; filename*=UTF-8''${safeFilename}`
    );

    // バイナリを返す
    return attachment.content;
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error(e, 'Mail attachment download error');
      throw createError({
        statusCode: 400,
        message: '添付ファイルの取得に失敗しました',
        cause: e,
      });
    }
  }
  throw createError({ statusCode: 500, message: 'Internal Server Error' });
});
