<script setup lang="ts"></script>

<template>
  <UHeader mode="slideover">
    <template #left>
      <div class="flex gap-4">
        <h1 class="text-2xl font-bold">
          <NuxtLink to="/apps/dashboard"
            ><img
              class="h-12 w-auto"
              alt="ピタマイのロゴ"
              src="/pitamai-only-logo.png"
          /></NuxtLink>
        </h1>
      </div>
    </template>
    <!-- <template #right>
      <div class="hidden xl:block">
      </div>
    </template> -->

    <template #body>
      <LazyAppAsideNavgation />
    </template>
  </UHeader>
</template>
