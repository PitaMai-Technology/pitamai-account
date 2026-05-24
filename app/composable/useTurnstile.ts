/**
 * useTurnstile.ts
 *
 * 役割:
 * Cloudflare Turnstile ウィジェットのレンダリングとトークン管理を提供
 *
 * 使い方:
 * ```ts
 * const { turnstileToken, resetTurnstileToken } = useTurnstile('container-id');
 *
 * // フォーム送信時
 * if (!turnstileToken.value) {
 *   toast.add({ title: 'エラー', description: 'Turnstile認証が必要です' });
 *   return;
 * }
 * await api.call({
 *   fetchOptions: {
 *     headers: { 'x-captcha-response': turnstileToken.value }
 *   }
 * });
 *
 * // エラー時にリセット
 * resetTurnstileToken();
 * ```
 */

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

type TurnstileApi = {
  render: (
    container: string | HTMLElement,
    options: TurnstileRenderOptions
  ) => string | number;
  reset: (widgetId?: string | number) => void;
};

export function useTurnstile(containerId: string) {
  const config = useRuntimeConfig();
  const turnstileToken = ref('');
  const turnstileWidgetId = ref<string | number | null>(null);
  const turnstileErrorMessage = ref<string | null>(null);
  const showTurnstileWidget = computed(
    () =>
      Boolean(config.public.TURNSTILE_SITE_KEY) && !turnstileErrorMessage.value
  );

  function getTurnstileApi(): TurnstileApi | null {
    const maybe = (globalThis as { turnstile?: TurnstileApi }).turnstile;
    return maybe ?? null;
  }

  useHead({
    script: [
      {
        key: 'turnstile-api',
        src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
        defer: true,
        async: true,
      },
    ],
  });

  function resetTurnstileToken() {
    turnstileToken.value = '';
    const turnstile = getTurnstileApi();
    if (turnstile && turnstileWidgetId.value !== null) {
      try {
        turnstile.reset(turnstileWidgetId.value);
      } catch (e) {
        // すでにウィジェットが破棄されている場合などのエラーを抑制
        console.warn('Turnstile reset failed (non-critical):', e);
      }
    }
  }

  function mountTurnstile() {
    const siteKey = config.public.TURNSTILE_SITE_KEY;
    if (!siteKey) {
      turnstileErrorMessage.value =
        'TURNSTILE_SITE_KEY または NUXT_PUBLIC_TURNSTILE_SITE_KEY が設定されていません。';
      return false;
    }

    const turnstile = getTurnstileApi();
    if (!turnstile) return false;

    // 要素が DOM 上に存在するか確認
    const container = document.getElementById(containerId);
    if (!container) return false;

    // すでにIDがある場合でも、コンテナ内にウィジェットが存在しないなら再レンダリングを許可
    if (turnstileWidgetId.value !== null) {
      // Turnstile が作成する iframe が存在するかチェック
      const turnstileWidget = container.querySelector(
        'iframe[src*="challenges.cloudflare.com"]'
      );
      if (turnstileWidget) {
        return true;
      }
      // ウィジェットが消えている場合は再レンダリング
      turnstileWidgetId.value = null;
    }

    try {
      turnstileErrorMessage.value = null;
      turnstileWidgetId.value = turnstile.render(container, {
        sitekey: siteKey as string,
        callback: token => {
          turnstileToken.value = token;
        },
        'expired-callback': () => {
          turnstileToken.value = '';
        },
        'error-callback': () => {
          turnstileToken.value = '';
        },
      });
      return true;
    } catch (e) {
      turnstileErrorMessage.value = 'Turnstile の表示に失敗しました。';
      console.error('Turnstile render error:', e);
      return false;
    }
  }

  onMounted(() => {
    if (!config.public.TURNSTILE_SITE_KEY) {
      turnstileErrorMessage.value =
        'TURNSTILE_SITE_KEY または NUXT_PUBLIC_TURNSTILE_SITE_KEY が設定されていません。';
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    let attemptCount = 0;
    const maxAttempts = 10;

    // マウントを試行し、成功したらタイマーを止める関数
    const checkAndMount = () => {
      const isMounted = mountTurnstile();
      if (isMounted && timer) {
        clearInterval(timer);
        timer = null;
      }
      return isMounted;
    };

    const startRetryTimer = () => {
      if (timer) return;

      attemptCount = 0;
      timer = setInterval(() => {
        attemptCount += 1;
        if (checkAndMount() || attemptCount >= maxAttempts) {
          if (!turnstileWidgetId.value && attemptCount >= maxAttempts) {
            turnstileErrorMessage.value =
              'Turnstile の読み込みに失敗しました。';
          }
          if (timer) clearInterval(timer);
          timer = null;
        }
      }, 1000);
    };

    // 初回実行
    if (!checkAndMount()) {
      startRetryTimer();
    }

    // タブ復帰時などのイベントで再チェック。消えていればタイマーを再開。
    const recover = () => {
      if (turnstileErrorMessage.value) return;

      if (!checkAndMount()) {
        startRetryTimer();
      }
    };

    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);

    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
      // ウィジェットを明示的にクリア
      resetTurnstileToken();
    });
  });

  return {
    turnstileToken,
    config,
    showTurnstileWidget,
    turnstileErrorMessage,
    resetTurnstileToken,
  };
}
