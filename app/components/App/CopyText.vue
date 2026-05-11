<script setup lang="ts">
import { useClipboard } from '@vueuse/core';

const props = defineProps<{
  value: string | null | undefined;
  label?: string;
  masked?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  color?: "error" | "primary" | "secondary" | "success" | "info" | "warning" | "neutral";
  variant?: "solid" | "outline" | "soft" | "subtle";
}>();

const { copy, copied } = useClipboard({ source: () => props.value ?? '' });
const toast = useToast();

const onCopy = async (e: MouseEvent) => {
  e.stopPropagation();
  if (!props.value) return;
  await copy();
  toast.add({
    title: 'クリップボードにコピーしました',
    color: 'success',
    duration: 2000,
  });
};

const isMasked = ref(!!props.masked);
const toggleMask = (e: MouseEvent) => {
  e.stopPropagation();
  isMasked.value = !isMasked.value;
};

const displayValue = computed(() => {
  if (!props.value) return '-';
  if (isMasked.value) {
    return '••••••••';
  }
  return props.value;
});
</script>

<template>
  <div class="inline-flex flex-col gap-1 max-w-full">
    <span v-if="label" class="text-[11px] text-neutral-500 font-bold uppercase tracking-wider px-1">
      {{ label }}
    </span>

    <UBadge :color="color || 'neutral'" :variant="variant || 'subtle'" :size="size || 'md'"
      class="font-mono items-center gap-2 overflow-hidden max-w-full" :ui="{
        base: 'py-1 px-3 text-sm font-semibold'
      }">
      <span class="truncate break-all select-all leading-none">{{ displayValue }}</span>

      <template #trailing>
        <div class="flex items-center gap-1">
          <UButton v-if="masked" :icon="isMasked ? 'i-lucide-eye' : 'i-lucide-eye-off'" variant="ghost" color="neutral"
            size="xs" square class="h-5 w-5 p-0" @click="toggleMask" />
          <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" variant="ghost"
            :color="copied ? 'success' : 'neutral'" size="xs" square class="h-5 w-5 p-0" @click="onCopy" />
        </div>
      </template>
    </UBadge>
  </div>
</template>
