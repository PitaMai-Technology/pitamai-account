<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify';

const props = withDefaults(
  defineProps<{
    html?: string | null;
    text?: string | null;
    blockMedia?: boolean;
    loading?: boolean;
  }>(),
  {
    html: null,
    text: null,
    blockMedia: false,
    loading: false,
  }
);

const sanitizedHtml = computed(() => {
  if (!props.html) return null;

  return DOMPurify.sanitize(props.html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: props.blockMedia
      ? ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed']
      : [],
  });
});
</script>

<template>
  <div class="prose prose-sm max-w-none">
    <div v-if="loading" class="space-y-2">
      <USkeleton class="h-4 w-1/3 bg-gray-100" />
      <USkeleton class="h-4 w-full bg-gray-100" />
      <USkeleton class="h-4 w-full bg-gray-100" />
      <USkeleton class="h-4 w-5/6 bg-gray-100" />
    </div>
    <div v-else-if="sanitizedHtml" v-html="sanitizedHtml" />
    <pre v-else-if="text"
      class="whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100">{{ text }}</pre>
    <p v-else class="text-sm text-gray-500">本文がありません。</p>
  </div>
</template>
