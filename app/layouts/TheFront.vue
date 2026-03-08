<script setup lang="ts">

useSeoMeta({
  title: 'PitaMaiアカウント - フロント画面',
  ogTitle: 'PitaMaiアカウント - フロント画面',
});

</script>

<template>
  <div class="bg-green-100/80">
    <FrontHeader />
    <UPage class="max-w-7xl m-auto">
      <UMain class="p-5 pt-10 max-w-6xl w- m-auto">
        <slot />
      </UMain>
    </UPage>
  </div>
</template>
