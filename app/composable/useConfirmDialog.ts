export function useConfirmDialog() {
  const open = ref(false);
  let resolveFn: ((value: boolean) => void) | null = null;

  function confirm(): Promise<boolean> {
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

  return {
    open,
    confirm,
    resolve,
  };
}
