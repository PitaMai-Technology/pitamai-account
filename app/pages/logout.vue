<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';

definePageMeta({
  layout: 'the-front',
});

</script>

<template>
  <div>
    <div class="flex items-center justify-center gap-4">
      <img src="/pitamai-only-logo.png" class="h-12" alt="PitaMai Logo" />
      <p class="text-xl font-semibold">共通アカウント</p>
    </div>
    <div class="flex flex-col items-center space-y-4 py-8">
      <p>連携先アプリケーションでログアウトしました。</p>
    </div>
  </div>
</template>
