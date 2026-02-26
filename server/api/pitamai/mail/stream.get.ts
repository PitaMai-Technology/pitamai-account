/**
 * server/api/pitamai/mail/stream.get.ts
 *
 * IMAPサーバーからのIDLEモードを利用し、サーバー送信イベント(SSE)で
 * クライアントに新着メール通知をリアルタイムでプッシュするエンドポイント。
 * Nuxt Nitro のストリーミング機能を使って長時間接続を維持します。
 */
import { createError, createEventStream, getQuery } from 'h3';
import { z } from 'zod';
import { ImapFlow } from 'imapflow';
import { requireMailAccountForUser } from '~~/server/utils/mail-account';
import { decryptMailPassword } from '~~/server/utils/mail-crypto';
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

  // disableAutoIdle: true — auto-IDLE を完全無効にする。
  // デフォルト (false) のままだと、下の idleLoop の明示的 idle() と
  // auto-IDLE が競合し、EXISTS 後の IDLE 再エントリーが
  // サーバー側タイムアウト（30秒〜）待ちなって遅延が生じる。
  const password = decryptMailPassword({
    ciphertext: account.encryptedPassword,
    iv: account.encryptionIv,
    authTag: account.encryptionAuthTag,
  });
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.username, pass: password },
    disableAutoIdle: true,
    logger: false,
  });

  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
  let existsCount = 0;
  let closed = false;

  // 5秒間隔で heartbeat イベントを送信して接続維持
  // existsCount も同梱し、クライアント側で差分検知できるようにする。
  const heartbeat = setInterval(() => {
    const mb = client.mailbox;
    const currentExists = mb ? mb.exists : existsCount;
    existsCount = currentExists;
    stream.push({
      event: 'heartbeat',
      data: JSON.stringify({
        at: new Date().toISOString(),
        folder: parsed.data.folder,
        exists: currentExists,
      }),
    });
  }, 5000);

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
    // getMailboxLock が内部で SELECT するため mailboxOpen は不要
    const mb = client.mailbox;
    existsCount = mb ? mb.exists : 0;

    client.on('exists', onExists);

    // IDLE ループ: idle() はサーバーが IDLE を終了するまでブロックし、
    // 終了後（新着検知 or サーバー側タイムアウト）即座に次の idle() へ。
    // disableAutoIdle: true により auto-IDLE との競合がないため、
    // idle() から返った瞬間に EXISTS が確実にハンドルされた状態で
    // 次の idle() に入れる。
    void (async () => {
      while (!closed) {
        try {
          await client.idle();
        } catch {
          if (!closed) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
    })();
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
