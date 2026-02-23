import type { Ref } from 'vue';

// ==============================================================================
// SSE（Server-Sent Events）リアルタイム接続管理
// ==============================================================================
// 役割: IMAP IDLE を SSE でラップ、新着検知、自動再接続（指数バックオフ）
// 再接続戦争: 500ms * (attempt+1)で段階的に遅延、最大5秒で抑制
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

  function startRealtimeStream() {
    // 日本語コメント: クライアント実行時のみ接続し、SSRや二重接続を避けます。
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
