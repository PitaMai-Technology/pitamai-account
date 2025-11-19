<script setup lang="ts"></script>

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
