/**
 * server/api/pitamai/mail/stream.get.ts
 *
 * IMAPサーバーからのIDLEモードを利用し、サーバー送信イベント(SSE)で
 * クライアントに新着メール通知をリアルタイムでプッシュするエンドポイント。
 * Nuxt Nitro のストリーミング機能を使って長時間接続を維持します。
 */
import { createError, createEventStream, getQuery } from 'h3';
import { z } from 'zod';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { createImapClient } from '~~/server/utils/imap';
import { logger } from '~~/server/utils/logger';

/**
 * クエリパラメータのバリデーションスキーマ。
 * folder は監視対象のフォルダ名で、デフォルトは 'INBOX'.
 */
const querySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
});

/**
 * SSE エンドポイント本体。クエリを検証し、
 * 利用者のメールアカウントへの IMAP 接続を確立した後、
 * フォルダ監視を開始します。
 */
export default defineEventHandler(async event => {
  // クエリパラメータの検証
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  // 認証済みユーザーの MailAccount を取得
  const account = await requireMailAccountForUser({ event });
  const stream = createEventStream(event);
  const client = createImapClient(account);
  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
  let existsCount = 0;
  let closed = false;

  // 15秒間隔で heartbeat イベントを送信して接続維持
  const heartbeat = setInterval(() => {
    stream.push({
      event: 'heartbeat',
      data: JSON.stringify({
        at: new Date().toISOString(),
        folder: parsed.data.folder,
      }),
    });
  }, 15000);

  // IMAP 'exists' イベントハンドラ。
  // メッセージ総数が前回より増えていたら 'new-mail' を送信。
  const onExists = (payload: unknown) => {
    try {
      const data =
        payload && typeof payload === 'object'
          ? (payload as { count?: number; prevCount?: number })
          : {};

      const nextCount = data.count ?? existsCount;
      const prevCount = data.prevCount ?? existsCount;

      existsCount = nextCount;

      if (nextCount > prevCount) {
        stream.push({
          event: 'new-mail',
          data: JSON.stringify({
            type: 'new-mail',
            accountId: account.id,
            folder: parsed.data.folder,
            exists: nextCount,
            previousExists: prevCount,
            at: new Date().toISOString(),
          }),
        });
      }
    } catch (error) {
      logger.error(
        { err: error, accountId: account.id },
        'SSEイベントの処理中にエラーが発生'
      );
    }
  };

  // 接続確立と初期化処理
  try {
    await client.connect();
    lock = await client.getMailboxLock(parsed.data.folder);
    const mailbox = await client.mailboxOpen(parsed.data.folder);
    existsCount = mailbox.exists;

    client.on('exists', onExists);

    // IDLE ループをバックグラウンドで回し続ける
    const idleLoop = async () => {
      while (!closed) {
        try {
          await client.idle();
        } catch {
          if (!closed) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
    };

    void idleLoop();
  } catch (error) {
    // 初期化に失敗した場合はリソースをクリーンアップしてエラー返却
    clearInterval(heartbeat);
    if (lock) {
      lock.release();
    }
    if (client.usable) {
      await client.logout().catch(() => {});
    }

    logger.error(
      { err: error, accountId: account.id },
      'リアルタイム接続の初期化に失敗しました'
    );
    throw createError({
      statusCode: 400,
      message: 'リアルタイム接続の初期化に失敗しました',
    });
  }

  // クライアント接続が切断された際のクリーンアップ処理
  stream.onClosed(async () => {
    closed = true;
    clearInterval(heartbeat);
    client.off('exists', onExists);
    if (lock) {
      lock.release();
    }
    if (client.usable) {
      await client.logout().catch(() => {});
    }
    await stream.close();
  });

  // 接続確立イベント
  stream.push({
    event: 'connected',
    data: JSON.stringify({
      accountId: account.id,
      folder: parsed.data.folder,
      at: new Date().toISOString(),
    }),
  });

  // 初期 ready イベントを送信
  stream.push({
    event: 'ready',
    data: JSON.stringify({
      type: 'ready',
      accountId: account.id,
      folder: parsed.data.folder,
      exists: existsCount,
      at: new Date().toISOString(),
    }),
  });

  return stream.send();
});
