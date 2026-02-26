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
    });

    stream.addEventListener('ready', () => {
      streamConnected.value = true;
    });

    stream.addEventListener('heartbeat', () => {
      streamConnected.value = true;
    });

    stream.addEventListener('new-mail', async () => {
      await params.onNewMail();
    });

    // エラー発生時は接続を閉じ、再接続タイマーを設定
    stream.addEventListener('error', () => {
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
