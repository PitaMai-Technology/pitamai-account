<script setup lang="ts"></script>

<template>
  <div>
    <FrontHeader />
    <UPage class="max-w-7xl m-auto">
      <UMain class="p-5 pt-10 max-w-6xl m-auto">
        <slot />
      </UMain>
    </UPage>
  </div>
</template>
