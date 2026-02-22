/**
 * 確認ダイアログ Pinia ストア
 *
 * シングルトンとして共有されるため、どのコンポーネントから confirm() を呼んでも
 * 同一の open / message 状態を参照します。
 *
 * 並行して発生する確認は想定していないため、同時に複数呼び出しを行わないようにしてください。
 */
export const useConfirmDialogStore = defineStore('confirmDialog', () => {
  const open = ref(false);
  const message = ref('');

  // Promise の resolve 関数をストア内に保持（非リアクティブ）
  let resolveFn: ((value: boolean) => void) | null = null;

  /**
   * 確認ダイアログを開き、ユーザーの選択結果を Promise で返します。
   */
  function confirm(customMessage?: string): Promise<boolean> {
    if (customMessage) {
      message.value = customMessage;
    }
    open.value = true;
    return new Promise(resolve => {
      resolveFn = resolve;
    });
  }

  /**
   * ダイアログを閉じ、Promise を解決します。
   * @param result - true: 確認 / false: キャンセル
   */
  function resolve(result: boolean) {
    if (resolveFn) {
      resolveFn(result);
      resolveFn = null;
    }
    open.value = false;
  }

  return { open, message, confirm, resolve };
});
