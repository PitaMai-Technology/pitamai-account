<script setup lang="ts">
const page = defineModel<number>('page', { required: true });

const props = withDefaults(
  defineProps<{
    total: number;
    itemsPerPage: number;
  }>(),
  {
    total: 0,
    itemsPerPage: 20,
  }
);
</script>

<template>
  <div v-if="props.total > 0" class="flex justify-center pt-4">
    <UPagination v-model:page="page" :total="props.total" :items-per-page="props.itemsPerPage" />
  </div>
</template>