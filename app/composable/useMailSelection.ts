import type { Ref } from 'vue';

// ==============================================================================
// メール複数選択とドラッグドロップ操作制御
// ==============================================================================
// 役割: Shift+クリック複数選択、ドラッグ開始時の単体/複数判定、ドロップ対象確定
type UseMailSelectionParams = {
  multiSelectedUids: Ref<number[]>;
  shiftDragBulkEnabled: Ref<boolean>;
  shiftDragSelectedUids: Ref<number[]>;
};

export function useMailSelection(params: UseMailSelectionParams) {
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

  function isUidMultiSelected(uid: number) {
    return params.multiSelectedUids.value.includes(uid);
  }

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

  function resolveDropTargetUids(uid: number) {
    return params.shiftDragBulkEnabled.value
      ? params.shiftDragSelectedUids.value
      : [uid];
  }

  function resetSelectionAfterDrop() {
    // 日本語コメント: ドロップ後に選択状態を明示的に初期化し、次回操作へ状態を持ち越さないようにします。
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
