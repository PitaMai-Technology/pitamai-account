<script setup lang="ts">

const model = defineModel<undefined>({ required: true });

const props = withDefaults(
  defineProps<{
    label?: string;
    placeholder?: string;
    clearLabel?: string;
    clearable?: boolean;
    clearDisabled?: boolean;
    numberOfMonths?: number;
  }>(),
  {
    label: '日付範囲',
    placeholder: '日付で絞り込み',
    clearLabel: '絞り込みクリア',
    clearable: true,
    clearDisabled: false,
    numberOfMonths: 2,
  }
);

const emit = defineEmits<{
  clear: [];
}>();

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate('Asia/Tokyo');
  }
  return new Date(value);
}

const buttonLabel = computed(() => {
  const start = toDate((model.value as any)?.start) as Date | null;
  const end = toDate((model.value as any)?.end) as Date | null;

  if (start && end) {
    return `${start.toLocaleDateString('ja-JP')} - ${end.toLocaleDateString('ja-JP')}`;
  }

  if (start) {
    return start.toLocaleDateString('ja-JP');
  }

  return props.placeholder;
});
</script>

<template>
  <div class="flex flex-wrap items-end gap-2">
    <UFormField :label="props.label" name="dateRange" class="min-w-65">
      <UPopover>
        <UButton color="neutral" variant="subtle" icon="i-lucide-calendar">
          {{ buttonLabel }}
        </UButton>

        <template #content>
          <UCalendar v-model="model" range class="p-2" :number-of-months="props.numberOfMonths" />
        </template>
      </UPopover>
    </UFormField>

    <UButton v-if="props.clearable" variant="ghost" :disabled="props.clearDisabled" @click="emit('clear')">
      {{ props.clearLabel }}
    </UButton>
  </div>
</template>