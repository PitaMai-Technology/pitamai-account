<script setup lang="ts">
</script>

<template>
  <div class="bg-gray-900/80 p-4 m-auto w-fit">
    <UIcon name="i-lucide-loader-circle" class="h-32 w-32 bg-white animate-spin-fast text-primary" />
  </div>
</template>

<style scoped>
@keyframes spin-fast {
  100% {
    transform: rotate(360deg);
  }
}

.animate-spin-fast {
  animation: spin-fast 0.5s linear infinite;
}
</style>