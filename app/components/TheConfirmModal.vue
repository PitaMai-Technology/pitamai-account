<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  title?: string;
  message: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const model = computed({
  get: () => props.open,
  set: (value: boolean) => {
    emit('update:open', value);
    if (!value) {
      emit('cancel');
    }
  },
});

function onConfirm() {
  emit('confirm');
  emit('update:open', false);
}

function onCancel() {
  emit('cancel');
  emit('update:open', false);
}
</script>

<template>
  <UModal v-model:open="model" :title="title ?? '確認'">
    <template #body>
      {{ message }}
    </template>
    <template #footer>
      <div class="flex items-baseline gap-2 justify-end">
        <UButton color="neutral" variant="outline" @click="onCancel">
          キャンセル
        </UButton>
        <UButton color="primary" size="sm" @click="onConfirm">
          はい
        </UButton>
      </div>
    </template>
  </UModal>
</template>
