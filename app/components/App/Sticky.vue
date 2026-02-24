<script setup lang="ts">
import { useWindowSize } from '@vueuse/core';
import type { CSSProperties } from 'vue';

const props = withDefaults(defineProps<{
  breakpoint?: number;
  top?: string;
}>(), {
  breakpoint: 1024,
  top: '1rem',
});

const { width: windowWidth } = useWindowSize();

const stickyClass = computed(() => {
  if (windowWidth.value < props.breakpoint) return '';
  return 'sticky self-start';
});

const stickyStyle = computed<CSSProperties | undefined>(() => {
  if (windowWidth.value < props.breakpoint) return undefined;
  return { top: props.top };
});
</script>

<template>
  <slot :sticky-class="stickyClass" :sticky-style="stickyStyle" />
</template>
