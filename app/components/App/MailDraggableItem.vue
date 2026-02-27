<script setup lang="ts">
/**
 * App/MailDraggableItem.vue
 *
 * メール一覧アイテムを表示するボタンクリック可能コンポーネント。
 * ドラッグ&ドロップ対応で複数選択・移動操作をサポートします。
 *
 * Props:
 * - message: 表示するメールデータ
 * - selectedUid: 現在選択中の UID
 * - openingUid: 開封中メッセージの UID（クリック無効化用）
 * - multiSelected: 複数選択状態フラグ
 * - selectedUids: 選択中 UID 配列
 * - selectedCount: 選択された件数
 *
 * Emits:
 * - open(uid) : メッセージを開く要求
 * - dragStart({uid,shiftKey}) : ドラッグ開始通知
 * - itemClick({uid,shiftKey}) : クリック操作（選択）
 */
import { computed } from 'vue';
import { useDraggable } from '@vue-dnd-kit/core';

type MailListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  hasAttachment: boolean;
  seen: boolean;
};

const props = defineProps<{
  message: MailListItem;
  selectedUid: number | null;
  openingUid: number | null;
  multiSelected?: boolean;
  selectedUids?: number[];
  selectedCount?: number;
}>();

const emit = defineEmits<{
  open: [uid: number];
  dragStart: [payload: { uid: number; shiftKey: boolean }];
  itemClick: [payload: { uid: number; shiftKey: boolean }];
}>();

// ドラッグ開始イベントを emit すると同時に dnd-kit のハンドラも呼ぶ
function onPointerDown(event: PointerEvent) {
  emit('dragStart', {
    uid: props.message.uid,
    shiftKey: event.shiftKey,
  });
  handleDragStart(event);
}

const className = computed(() => {
  // 複数選択状態でこのアイテムも選択されている場合は強調表示
  if (props.multiSelected) {
    return 'border-primary-400 bg-primary-50';
  }

  // 選択中のアイテムは特別なスタイル
  if (props.selectedUid === props.message.uid) {
    return 'border-gray-400 bg-gray-50';
  }

  // 既読/未読でスタイルを分ける
  return props.message.seen
    ? 'border-gray-200 bg-white'
    : 'border-emerald-400 bg-white';
});

const isDisabled = computed(() => props.openingUid === props.message.uid);

const dragUids = computed(() => {
  const selected = props.selectedUids ?? [];

  if (props.multiSelected && selected.length > 0) {
    return selected;
  }

  return [props.message.uid];
});

// クリック処理: shift キー併用で選択のみ、そうでなければ開く命令も出す
function onClick(event: MouseEvent) {
  emit('itemClick', {
    uid: props.message.uid,
    shiftKey: event.shiftKey,
  });

  if (event.shiftKey) {
    event.preventDefault();
    return;
  }

  emit('open', props.message.uid);
}

const { elementRef, handleDragStart, isDragging } = useDraggable({
  id: `mail-${props.message.uid}`,
  groups: ['mail-item'],
  data: computed(() => ({
    uid: props.message.uid,
    uids: dragUids.value,
  })),
});
</script>

<template>
  <button ref="elementRef" type="button" class="w-full rounded border px-3 py-2 text-left relative"
    :class="[className, isDragging ? 'opacity-70' : '']" :disabled="isDisabled" @pointerdown="onPointerDown"
    @click="onClick">
    <!-- 未読メッセージのインジケータ -->
    <UChip v-if="!message.seen" color="success" size="sm" class="absolute left-2.5 bottom-[105%]" position="top-right"
      inset />
    <p class="truncate text-sm font-medium">{{ message.subject || '(件名なし)' }}</p>
    <p class="truncate text-xs text-gray-600">{{ message.from || '-' }}</p>
    <p class="text-xs text-gray-500">{{ message.date ? new Date(message.date).toLocaleString('ja-JP') : '-' }}</p>
    <UBadge color="neutral" variant="outline" v-if="multiSelected && (selectedCount ?? 0) > 1"
      class="text-xs text-primary-700 absolute top-1 right-2">
      {{ selectedCount }}件選択中
    </UBadge>
  </button>
</template>
