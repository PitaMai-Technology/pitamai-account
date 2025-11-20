<script setup lang="ts"></script>

<template>
  <div>
    <NuxtLayout>
      <UApp>
        <NuxtLoadingIndicator :throttle="1" color="#8bc170" />
        <NuxtRouteAnnouncer />
        <NuxtPage />
      </UApp>
    </NuxtLayout>
  </div>
</template>
