import type { Ref } from 'vue';

/**
 * SSE（Server-Sent Events）リアルタイム接続管理
 *
 * IMAP IDLE をサーバー側で維持し、SSE でクライアントへ新着通知を
 * プッシュする仕組みを扱うコンポーザブル。
 * 自動再接続は指数バックオフを採用し、連続エラーによるスパム防止。
 *
 * @param {Ref<boolean>} hasMailSetting - メールアカウントの有無
 * @param {string} realtimeFolderPath - 監視フォルダパス
 * @param {(folder:string)=>string} createStreamUrl - SSE URL 生成関数
 * @param {() => Promise<void>} onNewMail - 新着メール時に呼び出すコールバック
 */
type UseMailRealtimeParams = {
  hasMailSetting: Ref<boolean>;
  realtimeFolderPath: string;
  createStreamUrl: (folder: string) => string;
  onNewMail: () => Promise<void>;
};

export function useMailRealtime(params: UseMailRealtimeParams) {
  const streamConnected = ref(false);

  let stream: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  // Track the last known exists count reported by the server in 'ready' events.
  // After a reconnect, if the count grew we know a mail arrived while disconnected.
  // JA: サーバーからの 'ready' イベントで最後に報告された exists カウントを追跡します。
  // 再接続後、カウントが増えていれば、切断中にメールが届いたことがわかります。
  let lastKnownExists = -1;

  // Heartbeat watchdog: the server sends a heartbeat every 5 seconds.
  // If nothing arrives for WATCHDOG_MS, the connection is considered silently
  // dead and we force a reconnect.
  const WATCHDOG_MS = 12_000;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      // No heartbeat / event for WATCHDOG_MS — treat as silent disconnect.
      streamConnected.value = false;
      if (stream) {
        stream.close();
        stream = null;
      }
      if (params.hasMailSetting.value) {
        startRealtimeStream();
      }
    }, WATCHDOG_MS);
  }

  function clearWatchdog() {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  /**
   * SSE 接続を開始する。
   * SSR 環境やメーリング設定なしの場合は何もしない。
   */
  function startRealtimeStream() {
    // クライアント実行時のみ接続し、SSRや二重接続を避ける
    if (!import.meta.client) return;
    if (!params.hasMailSetting.value) return;
    if (stream) return;

    const url = params.createStreamUrl(params.realtimeFolderPath);
    stream = new EventSource(url);

    stream.addEventListener('connected', () => {
      streamConnected.value = true;
      reconnectAttempt = 0;
      resetWatchdog();
    });

    stream.addEventListener('ready', async e => {
      streamConnected.value = true;
      resetWatchdog();

      // After a reconnect the server sends the current exists count.
      // If it grew since we last knew, a new mail arrived while we were
      // disconnected — trigger onNewMail() to catch up immediately.
      try {
        const data = JSON.parse((e as MessageEvent).data ?? '{}');
        const serverExists: number =
          typeof data.exists === 'number' ? data.exists : -1;
        const missed = lastKnownExists >= 0 && serverExists > lastKnownExists;
        lastKnownExists = serverExists;
        if (missed) {
          await params.onNewMail();
        }
      } catch {
        // ignore parse errors
      }
    });

    stream.addEventListener('heartbeat', async e => {
      streamConnected.value = true;
      resetWatchdog();

      // Fallback catch-up: if an exists event was missed, heartbeat carries
      // the latest mailbox exists count so we can refresh immediately.
      try {
        const data = JSON.parse((e as MessageEvent).data ?? '{}');
        const serverExists: number =
          typeof data.exists === 'number' ? data.exists : -1;
        const missed = lastKnownExists >= 0 && serverExists > lastKnownExists;
        lastKnownExists = serverExists;
        if (missed) {
          await params.onNewMail();
        }
      } catch {
        // ignore parse errors
      }
    });

    stream.addEventListener('new-mail', async e => {
      resetWatchdog();
      try {
        const data = JSON.parse((e as MessageEvent).data ?? '{}');
        if (typeof data.exists === 'number') {
          lastKnownExists = data.exists;
        }
      } catch {
        // ignore
      }
      await params.onNewMail();
    });

    // エラー発生時は接続を閉じ、再接続タイマーを設定
    stream.addEventListener('error', () => {
      clearWatchdog();
      streamConnected.value = false;
      if (stream) {
        stream.close();
        stream = null;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (!params.hasMailSetting.value) return;

      // 日本語コメント: 緩やかなバックオフ（最大5秒）で再接続し、連続失敗時の過負荷を抑制します。
      const delay = Math.min(5000, 500 * (reconnectAttempt + 1));
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startRealtimeStream();
      }, delay);
    });
  }

  /**
   * 現在の SSE 接続を停止し、再接続タイマーをクリアする。
   */
  function stopRealtimeStream() {
    clearWatchdog();
    lastKnownExists = -1;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (!stream) return;
    stream.close();
    stream = null;
    streamConnected.value = false;
  }

  return {
    streamConnected,
    startRealtimeStream,
    stopRealtimeStream,
  };
}
