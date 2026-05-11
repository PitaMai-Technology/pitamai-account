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

  function getTurnstileApi(): TurnstileApi | null {
    const maybe = (globalThis as { turnstile?: TurnstileApi }).turnstile;
    return maybe ?? null;
  }

  useHead({
    script: [
      {
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
      turnstile.reset(turnstileWidgetId.value);
    }
  }

  function mountTurnstile() {
    const siteKey = config.public.TURNSTILE_SITE_KEY;
    if (!siteKey || turnstileWidgetId.value !== null) return true;

    const turnstile = getTurnstileApi();
    if (!turnstile) return false;

    // 要素が DOM 上に存在するか確認
    const container = document.getElementById(containerId);
    if (!container) return false;

    try {
      turnstileWidgetId.value = turnstile.render(container, {
        sitekey: siteKey as string,
        callback: (token) => {
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
      console.error('Turnstile render error:', e);
      return true;
    }
  }

  onMounted(() => {
    if (!config.public.TURNSTILE_SITE_KEY) return;

    if (mountTurnstile()) return;

    const timer = setInterval(() => {
      if (mountTurnstile()) {
        clearInterval(timer);
      }
    }, 250);

    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
    });
  });

  return {
    turnstileToken,
    config,
    resetTurnstileToken,
  };
}
