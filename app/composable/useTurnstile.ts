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
    if (!siteKey) return true;

    const turnstile = getTurnstileApi();
    if (!turnstile) return false;

    // 要素が DOM 上に存在するか確認
    const container = document.getElementById(containerId);
    if (!container) return false;

    // すでにIDがある場合でも、コンテナが空（Vueの再描画などで消えた）なら再レンダリングを許可
    if (turnstileWidgetId.value !== null) {
      if (container.innerHTML.trim() !== '') {
        return true;
      }
      turnstileWidgetId.value = null;
    }

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
      return false;
    }
  }

  onMounted(() => {
    if (!config.public.TURNSTILE_SITE_KEY) return;

    // 初回マウント試行
    mountTurnstile();

    // 継続的にマウント状態を監視するタイマー
    // (一度成功しても、DOMから消えたら再マウントする)
    const timer = setInterval(() => {
      mountTurnstile();
    }, 1000);

    // タブが戻ってきたときなどに再チェック
    const handleFocus = () => mountTurnstile();
    window.addEventListener('focus', handleFocus);

    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      // ウィジェットを明示的にクリア
      resetTurnstileToken();
    });
  });

  return {
    turnstileToken,
    config,
    resetTurnstileToken,
  };
}
