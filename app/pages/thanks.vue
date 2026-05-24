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
        <div class="flex flex-col max-w-3xl m-auto text-center items-center space-y-6 py-8">
          <h1 class="text-2xl max-w-3xl font-bold">構成員への申請が完了しました！</h1>
          <img src="/omedetou.png" alt="おめでとう" class="bg-gray-500/80 w-64 h-auto p-4" />
          <p class="text-lg">
            構成員への申請が完了しました。問題がなければ承認され、メールが送信されますので、<wbr>しばらくお待ちください。
            また、承認されないと、ログインできませんのでご注意ください。
          </p>
          <p>なおDiscordサーバーが主な活動場所なので、まだ参加されていない場合は、 <ULink to="https://discord.gg/rf3et8MhKh" target="_blank"
              class="underline hover:text-gray-800">https://discord.gg/rf3et8MhKh</ULink> 参加を推奨します。
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
