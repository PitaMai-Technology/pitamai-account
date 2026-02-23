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
  dropMail: [uid: number, toFolderPath: string];
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
      const uid = payload.items[0]?.data?.uid;
      if (!uid || typeof uid !== 'number') {
        return false;
      }

      emit('dropMail', uid, props.folder.path);
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
