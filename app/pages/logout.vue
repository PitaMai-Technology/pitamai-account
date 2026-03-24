<script setup lang="ts">
definePageMeta({
  layout: 'the-front',
});

const route = useRoute();
const messageCode = computed(() => route.query.messages as string);
</script>

<template>
  <div>
    <div class="flex items-center justify-center gap-4">
      <img src="/pitamai-only-logo.png" class="h-12" alt="PitaMai Logo" />
      <p class="text-xl font-semibold">共通アカウント</p>
    </div>
    <div class="flex items-center justify-center p-4">
      <UPageCard class="max-w-5xl">
        <div class="flex flex-col items-center space-y-6 py-8">
          <template v-if="messageCode === 'M001'">
            <p class="text-lg">PitaMaiアカウントからログアウトしました。</p>
            <UButton to="/login" color="primary">
              再ログイン
            </UButton>
          </template>
          <template v-else-if="messageCode === 'M002'">
            <p class="text-lg">連携先アプリケーションでログアウトしました。</p>
          </template>
          <template v-else>
            <p class="text-lg">ログアウトしました。</p>
          </template>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
