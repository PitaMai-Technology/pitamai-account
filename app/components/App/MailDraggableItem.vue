<script setup lang="ts">
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
}>();

const emit = defineEmits<{
  open: [uid: number];
}>();

const className = computed(() => {
  if (props.selectedUid === props.message.uid) {
    return 'border-gray-400 bg-gray-50';
  }

  return props.message.seen
    ? 'border-gray-200 bg-white'
    : 'border-emerald-400 bg-white';
});

const isDisabled = computed(() => props.openingUid === props.message.uid);

const { elementRef, handleDragStart, isDragging } = useDraggable({
  id: `mail-${props.message.uid}`,
  groups: ['mail-item'],
  data: computed(() => ({
    uid: props.message.uid,
  })),
});
</script>

<template>
  <button ref="elementRef" type="button" class="w-full rounded border px-3 py-2 text-left"
    :class="[className, isDragging ? 'opacity-70' : '']" :disabled="isDisabled" @pointerdown="handleDragStart"
    @click="emit('open', message.uid)">
    <p class="truncate text-sm font-medium">{{ message.subject || '(件名なし)' }}</p>
    <p class="truncate text-xs text-gray-600">{{ message.from || '-' }}</p>
    <p class="text-xs text-gray-500">{{ message.date ? new Date(message.date).toLocaleString('ja-JP') : '-' }}</p>
  </button>
</template>
