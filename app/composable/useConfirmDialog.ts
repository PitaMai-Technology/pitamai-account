export function useConfirmDialog() {
  const open = ref(false);
  const message = ref('');
  let resolveFn: ((value: boolean) => void) | null = null;

  function confirm(customMessage?: string): Promise<boolean> {
    if (customMessage) {
      message.value = customMessage;
    }
    open.value = true;
    return new Promise(resolve => {
      resolveFn = resolve;
    });
  }

  function resolve(result: boolean) {
    if (resolveFn) {
      resolveFn(result);
      resolveFn = null;
    }
    open.value = false;
  }

  /**
   * ページ離脱時やリロード時に、無条件で警告を表示するガードを設定します。
   * フォームの状態などに関係なく、呼び出したページ全体に適用されます。
   */
  function registerPageLeaveGuard(
    message: string = 'このページから離脱しようとしていますが、本当に離脱しますか？'
  ) {
    if (import.meta.client) {
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };

      onMounted(() => {
        window.addEventListener('beforeunload', onBeforeUnload);
      });

      onUnmounted(() => {
        window.removeEventListener('beforeunload', onBeforeUnload);
      });
    }

    onBeforeRouteLeave(async (to, from, next) => {
      const result = await confirm(message);
      if (result) {
        next();
      } else {
        next(false);
      }
    });
  }

  return {
    open,
    message,
    confirm,
    resolve,
    registerPageLeaveGuard,
  };
}
