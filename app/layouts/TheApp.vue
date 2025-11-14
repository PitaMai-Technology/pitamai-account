<script setup lang="ts">

</script>

<template>
  <div>
    <AppHeader />
    <UPage class="m-auto min-h-screen bg-gray-50">
      <div class="max-w-7xl m-auto">
        <UMain class="p-5 pt-10 max-w-6xl m-auto">
          <slot />
        </UMain>
      </div>
    </UPage>
  </div>
</template>
