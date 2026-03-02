<script setup lang="ts">
const confirmStore = useConfirmDialogStore();
const { open } = storeToRefs(confirmStore);

const model = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (!value) {
      confirmStore.resolve(false);
    }
  },
});

function onConfirm() {
  confirmStore.resolve(true);
}

function onCancel() {
  confirmStore.resolve(false);
}
</script>

<template>
  <UModal v-model:open="model" :title="confirmStore.title">
    <template #body>
      {{ confirmStore.message }}
    </template>
    <template #footer>
      <div class="flex items-baseline gap-2 justify-end">
        <UButton color="neutral" variant="outline" @click="onCancel">
          キャンセル
        </UButton>
        <UButton color="primary" size="xs" @click="onConfirm">
          はい
        </UButton>
      </div>
    </template>
  </UModal>
</template>
