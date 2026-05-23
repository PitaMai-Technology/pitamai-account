<script setup lang="ts">
definePageMeta({
  layout: 'the-front',
});

const route = useRoute();

if (route.query.from !== 'register') {
  await navigateTo('/login', { replace: true });
}
</script>

<template>
  <div>
    <div class="flex items-center justify-center gap-4">
      <img src="/pitamai-only-logo.png" class="h-12" alt="PitaMai Logo" />
      <p class="text-xl font-semibold">共通アカウント</p>
    </div>
    <div class="flex items-center justify-center p-4">
      <UPageCard class="w-full max-w-5xl">
        <div class="flex flex-col items-center space-y-6 py-8">
          <h1 class="text-2xl font-bold">構成員への申請が完了しました！</h1>
          <p class="text-lg max-w-2xl">
            構成員への申請が完了しました。問題がなければ承認され、メールが送信されますので、しばらくお待ちください。
            また、承認されないと、ログインできませんのでご注意ください。<br>
            また、このタブは閉じて構いません。
          </p>
          <p>なお、連絡がない場合、お手数ですが以下のメールアドレスにお問い合わせください。</p>
          <p class="text-sm text-gray-500">
            <NuxtLink to="mailto:info@pitamai.com" target="_blank" class="underline hover:text-gray-800">
              info@pitamai.com
            </NuxtLink>
          </p>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
