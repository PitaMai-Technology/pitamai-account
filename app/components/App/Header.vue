<script setup lang="ts">
defineProps<{
  collapsed?: boolean;
}>();
</script>

<template>
  <NuxtLink to="/apps/dashboard" class="flex items-center">
    <img v-if="!collapsed" class="h-12 w-auto" alt="ピタマイのロゴ" src="/pitamai-only-logo.png" />
    <img v-else class="h-10 w-10 mx-auto" alt="ピタマイ" src="/pitamai-only-logo.png" />
  </NuxtLink>
</template>
