<script setup lang="ts">
definePageMeta({
  layout: 'the-front',
})

const route = useRoute()
const { data: page } = await useAsyncData(`kiyaku-${route.path}`, () => {
  return queryCollection('pages').path(route.path).first()
})

if (!page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'ページが見つかりません',
  })
}

useSeoMeta({
  title: () => `${page.value?.title} - PitaMaiアカウント`,
  ogTitle: () => `${page.value?.title} - PitaMaiアカウント`,
  description: () => page.value?.description,
  ogDescription: () => page.value?.description,
})
</script>

<template>
  <div class="container">
    <ContentRenderer v-if="page" :value="page" />
  </div>
</template>
