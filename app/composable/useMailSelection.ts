import type { Ref } from 'vue';

/**
 * メール一覧の複数選択およびドラッグ操作を管理するコンポーザブル。
 *
 * - Shift+クリックによる複数選択
 * - ドラッグ開始時に単体/一括移動判定
 * - ドロップ時の対象 UID リストを計算
 *
 * @param {Ref<number[]>} multiSelectedUids - 現在複数選択中の UID リスト
 * @param {Ref<boolean>} shiftDragBulkEnabled - Shiftドラッグで一括モードか
 * @param {Ref<number[]>} shiftDragSelectedUids - ドラッグ対象の UID リスト
 */
type UseMailSelectionParams = {
  multiSelectedUids: Ref<number[]>;
  shiftDragBulkEnabled: Ref<boolean>;
  shiftDragSelectedUids: Ref<number[]>;
};

export function useMailSelection(params: UseMailSelectionParams) {
  /**
   * ドラッグ開始イベントハンドラ。
   * shiftキー押下または既選択項目のドラッグ時は一括移動モードに切り替える。
   */
  function onMailDragStart(payload: { uid: number; shiftKey: boolean }) {
    const isInSelected = params.multiSelectedUids.value.includes(payload.uid);

    // 日本語コメント: Shift押下または選択済み項目のドラッグ時は複数移動を優先し、単体移動への誤判定を防ぎます。
    if (
      (payload.shiftKey || isInSelected) &&
      params.multiSelectedUids.value.length > 0
    ) {
      params.shiftDragBulkEnabled.value = true;
      params.shiftDragSelectedUids.value =
        params.multiSelectedUids.value.includes(payload.uid)
          ? [...params.multiSelectedUids.value]
          : [...params.multiSelectedUids.value, payload.uid];
      return;
    }

    params.shiftDragBulkEnabled.value = false;
    params.shiftDragSelectedUids.value = [payload.uid];
  }

  /**
   * UID が現在複数選択状態にあるかをチェック
   */
  function isUidMultiSelected(uid: number) {
    return params.multiSelectedUids.value.includes(uid);
  }

  /**
   * メール項目クリックハンドラ。
   * shiftKey の時は選択トグル、通常クリックは全解除。
   */
  function onMailItemClick(payload: { uid: number; shiftKey: boolean }) {
    // 日本語コメント: 通常クリックは選択解除、Shiftクリックのみトグル追加として挙動を明確化します。
    if (!payload.shiftKey) {
      params.multiSelectedUids.value = [];
      return;
    }

    if (params.multiSelectedUids.value.includes(payload.uid)) {
      params.multiSelectedUids.value = params.multiSelectedUids.value.filter(
        uid => uid !== payload.uid
      );
      return;
    }

    params.multiSelectedUids.value = [
      ...params.multiSelectedUids.value,
      payload.uid,
    ];
  }

  /**
   * ドロップ時に移動すべき UID リストを返す
   */
  function resolveDropTargetUids(uid: number) {
    return params.shiftDragBulkEnabled.value
      ? params.shiftDragSelectedUids.value
      : [uid];
  }

  /**
   * ドロップ完了後に内部選択状態をリセット
   */
  function resetSelectionAfterDrop() {
    // ドロップ後に選択状態を明示的に初期化し、次回操作へ状態を持ち越さないようにする
    params.shiftDragBulkEnabled.value = false;
    params.shiftDragSelectedUids.value = [];
    params.multiSelectedUids.value = [];
  }

  return {
    onMailDragStart,
    isUidMultiSelected,
    onMailItemClick,
    resolveDropTargetUids,
    resetSelectionAfterDrop,
  };
}
