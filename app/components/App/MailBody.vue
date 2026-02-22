<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify';

const props = withDefaults(
  defineProps<{
    html?: string | null;
    text?: string | null;
  }>(),
  {
    html: null,
    text: null,
  }
);

const blockedHtml = computed(() => {
  if (!props.html) return null;

  const sanitized = DOMPurify.sanitize(props.html, {
    USE_PROFILES: { html: true },
  });

  return sanitized.replace(
    /<img\b[^>]*>/gi,
    '<p class="my-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">画像はプライバシー保護のため自動読み込みをブロックしています。</p>'
  );
});
</script>

<template>
  <div class="prose prose-sm max-w-none">
    <div v-if="blockedHtml" v-html="blockedHtml" />
    <pre v-else-if="text"
      class="whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-sm">{{ text }}</pre>
    <p v-else class="text-sm text-gray-500">本文がありません。</p>
  </div>
</template>
