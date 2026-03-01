/**
 * server/utils/mail-realtime.ts
 *
 * IMAP のリアルタイム監視ユーティリティ。
 */
import type { MailAccount } from '@prisma/client';
import { createImapClient } from '~~/server/utils/imap';
import { logger } from '~~/server/utils/logger';

/**
 * IMAP 接続に必要な MailAccount のサブセット型。
 * @typedef {object} MailAccountConnection
 * @property {string} id - MailAccount の ID
 * @property {string} imapHost - IMAP ホスト名
 * @property {number} imapPort - IMAP ポート
 * @property {boolean} imapSecure - SSL/TLS 使用有無
 * @property {string} username - 接続ユーザー名
 * @property {string} encryptedPassword - 暗号化されたパスワード
 * @property {string} encryptionIv - 暗号化で使用した IV
 * @property {string} encryptionAuthTag - GCM 認証タグ
 */
type MailAccountConnection = Pick<
  MailAccount,
  | 'id'
  | 'imapHost'
  | 'imapPort'
  | 'imapSecure'
  | 'username'
  | 'encryptedPassword'
  | 'encryptionIv'
  | 'encryptionAuthTag'
>;

/**
 * watch から購読者へ送るイベントの型定義。
 * @typedef {object} MailRealtimeEvent
 * @property {'ready'|'heartbeat'|'new-mail'|'error'} type - イベント種別
 */
type MailRealtimeEvent =
  | { type: 'ready'; accountId: string; folder: string }
  | { type: 'heartbeat'; accountId: string; folder: string; at: string }
  | {
      type: 'new-mail';
      accountId: string;
      folder: string;
      exists: number;
      previousExists: number;
      at: string;
    }
  | { type: 'error'; accountId: string; message: string; at: string };

/**
 * 購読者コールバック。受け取ったイベントを元にクライアント側で処理します。
 * @callback Subscriber
 * @param {MailRealtimeEvent} event - イベントペイロード
 */
type Subscriber = (event: MailRealtimeEvent) => void;

/**
 * 監視単位（アカウント + フォルダ）を表す内部構造体。
 * @typedef {object} Watcher
 * @property {MailAccountConnection} account - 接続情報
 * @property {string} folder - 監視対象フォルダ名
 * @property {Set<Subscriber>} subscribers - 登録された購読者集合
 * @property {boolean} running - 監視ループ稼働フラグ
 * @property {boolean} stopRequested - 停止要求フラグ
 * @property {number} existsCount - 最終確認メッセージ数
 */
type Watcher = {
  account: MailAccountConnection;
  folder: string;
  subscribers: Set<Subscriber>;
  running: boolean;
  stopRequested: boolean;
  existsCount: number;
};

// key = `${account.id}:${folder}` として Watcher を一意管理します。
const watchers = new Map<string, Watcher>();

/**
 * Watcher マップ用のキーを生成します。
 * @param {MailAccountConnection} account - アカウント接続情報
 * @param {string} folder - フォルダ名
 * @returns {string} accountId:folder 形式のキー
 */
function keyOf(account: MailAccountConnection, folder: string) {
  return `${account.id}:${folder}`;
}

/**
 * 指定された Watcher に登録された全購読者へイベントを配信します。
 * 購読者側の例外は吸収します。
 * @param {Watcher} watcher - 送信先の Watcher
 * @param {MailRealtimeEvent} event - 送信するイベント
 * @returns {void}
 */
function broadcast(watcher: Watcher, event: MailRealtimeEvent) {
  watcher.subscribers.forEach(subscriber => {
    try {
      subscriber(event);
    } catch {
      // 購読者の実装エラーは無視（個別クライアントでハンドルさせる）
    }
  });
}

/**
 * 実際の監視処理を行う非同期ルーチン。
 * - IMAP クライアントを接続し、指定フォルダの mailbox lock を取得した上で
 *   `exists` イベントをリッスンします。
 * - 新着判定や heartbeat の判定は onExists 内で行い、購読者へ通知します。
 * - `watcher.stopRequested` が true になったらループを抜け、イベントハンドラを解除します。
 * @param {Watcher} watcher - 監視対象の Watcher
 * @returns {Promise<void>} 完了時に解決する Promise
 */
async function runWatcher(watcher: Watcher) {
  const client = await createImapClient(watcher.account);
  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;

  try {
    await client.connect();
    lock = await client.getMailboxLock(watcher.folder);
    const mailbox = await client.mailboxOpen(watcher.folder);
    watcher.existsCount = mailbox.exists;

    // 監視開始完了を購読者へ通知
    broadcast(watcher, {
      type: 'ready',
      accountId: watcher.account.id,
      folder: watcher.folder,
    });

    /**
     * IMAP 'exists' イベントハンドラ。
     * @param {unknown} data - imap クライアントから渡されるデータ
     * - 期待される構造: { count?: number; prevCount?: number }
     */
    const onExists = (data: unknown) => {
      try {
        const payload =
          data && typeof data === 'object'
            ? (data as { count?: number; prevCount?: number })
            : { count: undefined, prevCount: undefined };

        const count = payload.count ?? watcher.existsCount;
        const prevCount = payload.prevCount ?? watcher.existsCount;

        if (count > prevCount) {
          // メール件数が増加していれば新着イベント
          broadcast(watcher, {
            type: 'new-mail',
            accountId: watcher.account.id,
            folder: watcher.folder,
            exists: count,
            previousExists: prevCount,
            at: new Date().toISOString(),
          });
        } else {
          // 増加がなければ接続生存確認として heartbeat を送る
          broadcast(watcher, {
            type: 'heartbeat',
            accountId: watcher.account.id,
            folder: watcher.folder,
            at: new Date().toISOString(),
          });
        }

        watcher.existsCount = count;
      } catch {
        // イベント処理内のエラーは購読者や他の処理へ影響させない
      }
    };

    client.on('exists', onExists);

    // 停止要求が来るまで短いスリープで待機（ループは軽量なポーリング）
    while (!watcher.stopRequested) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    client.off('exists', onExists);
  } catch (error) {
    // 監視中に例外が発生したらログ出力して購読者へ error を通知
    logger.error(
      { err: error, accountId: watcher.account.id },
      'mail realtime watcher failed'
    );
    broadcast(watcher, {
      type: 'error',
      accountId: watcher.account.id,
      message: 'mail watcher error',
      at: new Date().toISOString(),
    });
  } finally {
    // 稼働フラグを落とし、リソースをクリーンアップ
    watcher.running = false;

    if (lock) {
      lock.release();
    }

    if (client.usable) {
      await client.logout().catch(() => {});
    }

    // 購読者がいなければ watchers マップから削除してメモリを解放
    if (watcher.subscribers.size === 0) {
      watchers.delete(keyOf(watcher.account, watcher.folder));
    }
  }
}

/**
 * 外部向け購読 API。
 * @param {{account: MailAccountConnection, folder: string, subscriber: Subscriber}} params
 * @param {MailAccountConnection} params.account - 接続情報（MailAccountConnection のサブセット）
 * @param {string} params.folder - 監視対象のフォルダ名
 * @param {Subscriber} params.subscriber - イベント受信用コールバック
 * @returns {() => void} 解除関数（呼ぶとこの subscriber の購読を解除します）
 */
export function subscribeMailRealtime(params: {
  account: MailAccountConnection;
  folder: string;
  subscriber: Subscriber;
}) {
  const key = keyOf(params.account, params.folder);
  const existing = watchers.get(key);

  // 既存の Watcher があれば共有、なければ新規作成
  const watcher =
    existing ??
    ({
      account: params.account,
      folder: params.folder,
      subscribers: new Set<Subscriber>(),
      running: false,
      stopRequested: false,
      existsCount: 0,
    } satisfies Watcher);

  watcher.subscribers.add(params.subscriber);

  if (!existing) {
    watchers.set(key, watcher);
  }

  // Watcher が未稼働ならバックグラウンドで起動
  if (!watcher.running) {
    watcher.running = true;
    watcher.stopRequested = false;
    void runWatcher(watcher);
  }

  // 解除関数: 購読を外し、購読者が0になれば停止要求を出す
  return () => {
    watcher.subscribers.delete(params.subscriber);
    if (watcher.subscribers.size === 0) {
      watcher.stopRequested = true;
    }
  };
}
