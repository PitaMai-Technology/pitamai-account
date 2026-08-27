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
  remove: (widgetId: string | number) => void;
};

type UseTurnstileOptions = {
  /**
   * true の場合はページのマウント直後に表示を試みる。
   * 折りたたみ内など、初期表示でコンテナが存在しない場合は false にし、
   * requestTurnstileMount() を表示後に呼ぶ。
   */
  autoMount?: boolean;
};

export function useTurnstile(
  containerId: string,
  options: UseTurnstileOptions = {}
) {
  const config = useRuntimeConfig();
  const turnstileToken = ref('');
  const turnstileWidgetId = ref<string | number | null>(null);
  const turnstileErrorMessage = ref<string | null>(null);
  const mountRequested = ref(options.autoMount !== false);
  let startRetryTimer: (() => void) | null = null;
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

  /**
   * ページを離れるときなど、現在のウィジェットがもう不要な場合に使う。
   *
   * reset は同じ DOM 上でもう一度認証させるための操作で、ウィジェット自体は残る。
   * 一方、ページ遷移ではコンテナも破棄されるため remove で Turnstile 側の登録まで消す。
   * これを行わないと、再訪時に古い ID と新しいコンテナが食い違うことがある。
   */
  function removeTurnstileWidget() {
    turnstileToken.value = '';

    const widgetId = turnstileWidgetId.value;
    turnstileWidgetId.value = null;
    if (widgetId === null) return;

    const turnstile = getTurnstileApi();
    if (!turnstile) return;

    try {
      turnstile.remove(widgetId);
    } catch (e) {
      // DOM が先に破棄された場合でも、ページ遷移そのものは止めない。
      console.warn('Turnstile remove failed (non-critical):', e);
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

  /**
   * 折りたたみやモーダルを開き、コンテナがDOMへ追加された後に呼ぶ。
   * Turnstileのスクリプトがまだ届いていない場合は、自動的に再試行する。
   *
   * @example
   * ```ts
   * await nextTick()
   * requestTurnstileMount()
   * ```
   */
  function requestTurnstileMount() {
    mountRequested.value = true;
    if (!mountTurnstile()) {
      startRetryTimer?.();
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

    const beginRetryTimer = () => {
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
    startRetryTimer = beginRetryTimer;

    // 折りたたみ内では、コンテナが表示されるまで初期化を待つ。
    if (mountRequested.value && !checkAndMount()) {
      beginRetryTimer();
    }

    // タブ復帰時などのイベントで再チェック。消えていればタイマーを再開。
    const recover = () => {
      if (!mountRequested.value || turnstileErrorMessage.value) return;

      if (!checkAndMount()) {
        beginRetryTimer();
      }
    };

    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);

    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
      startRetryTimer = null;
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
      // ページ遷移ではコンテナも消えるため、reset ではなく remove する。
      removeTurnstileWidget();
    });
  });

  return {
    turnstileToken,
    config,
    showTurnstileWidget,
    turnstileErrorMessage,
    resetTurnstileToken,
    requestTurnstileMount,
  };
}
