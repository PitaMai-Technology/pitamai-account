<script setup lang="ts">
// faviconの指定
useHead({
  link: [
    {
      rel: 'icon',
      href: '/favicon.png',
    },
  ],
});
</script>

<template>
  <div>
    <UApp>
      <NuxtLayout>
        <NuxtLoadingIndicator :throttle="1" color="#8bc170" />
        <NuxtRouteAnnouncer />
        <NuxtPage />
      </NuxtLayout>
    </UApp>
  </div>
</template>
