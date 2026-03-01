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
  const password = await decryptMailPassword({
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
  let lastEmittedExistsCount = 0;
  let closed = false;
  let cleanedUp = false;
  let heartbeatInFlight = false;
  let lastExistsAtMs = Date.now();

  const emitNewMail = (nextCount: number, previousExists: number) => {
    // 同じ件数（または過去件数）での重複通知を抑止する。
    if (nextCount <= lastEmittedExistsCount) {
      logger.debug(
        {
          op: 'mail.sse.new_mail.skip_duplicate',
          accountId: account.id,
          folder: parsed.data.folder,
          nextCount,
          lastEmittedExistsCount,
        },
        'Skip duplicate new-mail emission'
      );
      return;
    }

    lastEmittedExistsCount = nextCount;

    const detectedAtIso = new Date().toISOString();

    stream.push({
      event: 'new-mail',
      data: JSON.stringify({
        type: 'new-mail',
        accountId: account.id,
        folder: parsed.data.folder,
        exists: nextCount,
        previousExists,
        at: detectedAtIso,
      }),
    });

    logger.info(
      {
        op: 'mail.sse.new_mail.emit',
        accountId: account.id,
        folder: parsed.data.folder,
        nextCount,
        previousExists,
        detectedAt: detectedAtIso,
      },
      'SSE new-mail event emitted'
    );

    // 遅延調査用: exists検知時点で最新メッセージの internalDate を取得し、
    // サーバー側での検知遅延（ms）を計測する。
    void (async () => {
      try {
        const latest = await client.fetchOne(
          '*',
          {
            uid: true,
            internalDate: true,
            envelope: true,
          },
          { uid: false }
        );

        if (!latest || typeof latest !== 'object') {
          return;
        }

        const detectedAtMs = Date.parse(detectedAtIso);
        const internalDateMs = latest.internalDate
          ? new Date(latest.internalDate).getTime()
          : null;

        logger.info(
          {
            op: 'mail.sse.new_mail.diagnose',
            accountId: account.id,
            folder: parsed.data.folder,
            detectedAt: detectedAtIso,
            latestUid: latest.uid ?? null,
            latestSubject: latest.envelope?.subject ?? null,
            latestInternalDate: latest.internalDate
              ? new Date(latest.internalDate).toISOString()
              : null,
            lagMsFromInternalDate:
              internalDateMs !== null ? detectedAtMs - internalDateMs : null,
          },
          'SSE new-mail timing diagnostic'
        );
      } catch (diagnoseError) {
        logger.debug(
          {
            op: 'mail.sse.new_mail.diagnose.error',
            accountId: account.id,
            folder: parsed.data.folder,
            err: diagnoseError,
          },
          'SSE diagnose fetch failed'
        );
      }
    })();
  };

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;

    closed = true;
    clearInterval(heartbeat);
    client.off('exists', onExists);
    client.off('close', onClose);
    client.off('error', onError);

    if (lock) {
      lock.release();
      lock = null;
    }

    if (client.usable) {
      await client.logout().catch(() => {});
    }
  };

  const closeStreamSafely = async (reason: string) => {
    logger.warn(
      { accountId: account.id, folder: parsed.data.folder, reason },
      'IMAP stream closed, forcing SSE reconnect'
    );

    await cleanup();
    await stream.close();
  };

  const onClose = () => {
    if (closed) return;
    void closeStreamSafely('imap-close');
  };

  const onError = (err: unknown) => {
    logger.error(
      { err, accountId: account.id, folder: parsed.data.folder },
      'IMAP watcher connection error'
    );

    if (closed) return;
    void closeStreamSafely('imap-error');
  };

  // 5秒間隔で heartbeat を送信。
  // 標準寄りの補完として、一定時間 EXISTS が来ない場合に NOOP を送って
  // サーバー側の未送信更新をフラッシュさせる。
  const heartbeat = setInterval(() => {
    if (closed || heartbeatInFlight) {
      return;
    }

    heartbeatInFlight = true;

    void (async () => {
      try {
        // EXISTS がしばらく来ない場合は NOOP でサーバー通知を促進する。
        if (Date.now() - lastExistsAtMs >= 5000) {
          await client.noop();
        }

        const mailbox = client.mailbox;
        const currentExists =
          mailbox &&
          typeof mailbox === 'object' &&
          typeof mailbox.exists === 'number'
            ? mailbox.exists
            : existsCount;

        if (currentExists > existsCount) {
          const previousExists = existsCount;
          existsCount = currentExists;
          emitNewMail(currentExists, previousExists);
        } else {
          existsCount = currentExists;
        }

        stream.push({
          event: 'heartbeat',
          data: JSON.stringify({
            at: new Date().toISOString(),
            folder: parsed.data.folder,
            exists: currentExists,
          }),
        });
      } catch (heartbeatError) {
        logger.debug(
          {
            op: 'mail.sse.heartbeat.noop.error',
            accountId: account.id,
            folder: parsed.data.folder,
            err: heartbeatError,
          },
          'Heartbeat NOOP failed'
        );
      } finally {
        heartbeatInFlight = false;
      }
    })();
  }, 5000);

  // IMAP 'exists' イベントハンドラ。
  // メッセージ総数が前回より増えていたら 'new-mail' を送信。
  const onExists = (payload: unknown) => {
    try {
      const localBefore = existsCount;
      const data =
        payload && typeof payload === 'object'
          ? (payload as { count?: number; prevCount?: number })
          : {};

      const mailbox = client.mailbox;
      const mailboxExists =
        mailbox &&
        typeof mailbox === 'object' &&
        typeof mailbox.exists === 'number'
          ? mailbox.exists
          : null;

      const nextCount =
        typeof data.count === 'number'
          ? data.count
          : (mailboxExists ?? localBefore);

      const payloadPrevCount =
        typeof data.prevCount === 'number' ? data.prevCount : null;

      // prevCount はサーバー/実装依存で不整合があり得るため、
      // ローカル直前値(localBefore)を基準に増加判定する。
      const increased = nextCount > localBefore;

      existsCount = nextCount;
      lastExistsAtMs = Date.now();

      logger.debug(
        {
          op: 'mail.sse.exists.received',
          accountId: account.id,
          folder: parsed.data.folder,
          localBefore,
          payloadCount: typeof data.count === 'number' ? data.count : null,
          payloadPrevCount,
          mailboxExists,
          nextCount,
          increased,
        },
        'IMAP exists event received'
      );

      if (increased) {
        emitNewMail(nextCount, localBefore);
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
    lastEmittedExistsCount = existsCount;

    client.on('exists', onExists);
    client.on('close', onClose);
    client.on('error', onError);

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
    await cleanup();

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
    await cleanup();
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
