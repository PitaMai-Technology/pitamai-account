<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify';

const props = withDefaults(
  defineProps<{
    html?: string | null;
    text?: string | null;
    blockMedia?: boolean;
  }>(),
  {
    html: null,
    text: null,
    blockMedia: false,
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
    <div v-if="sanitizedHtml" v-html="sanitizedHtml" />
    <pre v-else-if="text"
      class="whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-sm">{{ text }}</pre>
    <p v-else class="text-sm text-gray-500">本文がありません。</p>
  </div>
</template>
