<script setup lang="ts">
import { computed } from 'vue';
import { useDroppable } from '@vue-dnd-kit/core';

type MailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
};

const props = defineProps<{
  folder: MailFolder;
  activeFolderPath: string;
  icon: string;
  label: string;
}>();

const emit = defineEmits<{
  select: [path: string];
  dropMail: [uids: number[], toFolderPath: string];
}>();

const buttonClass = computed(() =>
  props.activeFolderPath === props.folder.path ? 'solid' : 'ghost'
);

const { elementRef, isOvered } = useDroppable({
  groups: ['mail-item'],
  data: computed(() => ({
    folderPath: props.folder.path,
  })),
  events: {
    onDrop: async (_store, payload) => {
      const dragged = payload.items[0]?.data as
        | { uid?: number; uids?: number[] }
        | undefined;

      const droppedUids = Array.isArray(dragged?.uids)
        ? dragged.uids.filter((item): item is number => typeof item === 'number')
        : typeof dragged?.uid === 'number'
          ? [dragged.uid]
          : [];

      if (droppedUids.length === 0) {
        return false;
      }

      emit('dropMail', droppedUids, props.folder.path);
      return true;
    },
  },
});
</script>

<template>
  <div ref="elementRef" :class="isOvered ? 'rounded border border-primary-300 bg-primary-50/40' : ''">
    <UButton :variant="buttonClass" color="neutral" class="w-full justify-start" @click="emit('select', folder.path)">
      <UIcon :name="icon" class="mr-2" />
      {{ label }}
    </UButton>
  </div>
</template>
