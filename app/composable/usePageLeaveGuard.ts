import { useConfirmDialogStore } from '~/stores/confirmDialog';

/**
 * ページ離脱ガードを設定するコンポーザブル。
 *
 * コンポーネントのセットアップ時に呼び出すと、以下の 2 つのガードが有効になります。
 * 1. ブラウザのリロード・タブ閉じ時: beforeunload で標準ダイアログを表示
 * 2. Vue Router のルート遷移時: useConfirmDialogStore の confirm で確認
 *
 * @param message ルート遷移時の確認メッセージ
 */
export function usePageLeaveGuard(
  message: string = 'このページから離脱しようとしていますが、本当に離脱しますか？'
) {
  const { confirm } = useConfirmDialogStore();

  if (import.meta.client) {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
    onUnmounted(() =>
      window.removeEventListener('beforeunload', onBeforeUnload)
    );
  }

  onBeforeRouteLeave(async (_to, _from, next) => {
    const result = await confirm(message);
    if (result) next();
    else next(false);
  });
}
