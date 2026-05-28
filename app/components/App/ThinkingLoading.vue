<script setup lang="ts">
</script>

<template>
  <div class=" p-6 w-fit">
    <img src="/thinking.svg" class="h-32 w-32 text-primary" />
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