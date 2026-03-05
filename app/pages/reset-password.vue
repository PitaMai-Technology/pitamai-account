<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';

definePageMeta({
  layout: 'the-front',
});

const toast = useToast();
const route = useRoute();
const loading = ref(false);
const resetCompleted = ref(false);
const { turnstileToken, resetTurnstileToken, config } = useTurnstile('reset-password-turnstile');

const schema = z.object({
  newPassword: z.string().min(8, 'パスワードは最低8文字必要です'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword'],
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  newPassword: '',
  confirmPassword: '',
});

const token = computed(() => {
  const t = route.query.token as string;
  return t || null;
});

const errorMessage = computed(() => {
  const error = route.query.error as string;
  if (error === 'invalid_token') {
    return 'パスワード再設定リンクが無効です。有効期限を超過している可能性があります。';
  }
  return null;
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!token.value) {
    toast.add({
      title: 'エラー',
      description: 'トークンが見つかりません。',
      color: 'error',
    });
    return;
  }

  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  if (loading.value) return;

  loading.value = true;
  try {
    const { error } = await authClient.resetPassword({
      newPassword: event.data.newPassword,
      token: token.value,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'リセットに失敗しました',
        description: error.message || 'エラーが発生しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    resetCompleted.value = true;
    resetTurnstileToken();
    toast.add({
      title: 'パスワードをリセットしました',
      description: 'ログイン画面へ移動します。',
      color: 'success',
    });

    setTimeout(() => {
      navigateTo('/login');
    }, 2000);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex items-center justify-center p-4">
    <UPageCard class="w-full max-w-md">
      <template #title>パスワード再設定</template>

      <div v-if="errorMessage" class="mb-4 p-4 rounded-lg bg-error/10 border border-error/20">
        <p class="text-sm text-error">{{ errorMessage }}</p>
        <UButton to="/login" class="mt-4">ログイン画面へ戻る</UButton>
      </div>

      <div v-else-if="resetCompleted" class="text-center py-8">
        <UIcon name="i-lucide-check-circle" class="h-16 w-16 text-success mx-auto mb-4" />
        <h2 class="text-lg font-semibold mb-2">パスワードをリセットしました</h2>
        <p class="text-sm text-neutral-600">ログイン画面へ移動中...</p>
      </div>

      <div v-else class="space-y-4">
        <p v-if="!token" class="text-sm text-error">
          エラー：トークンが見つかりません。
        </p>

        <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
          <p class="text-sm text-neutral-600">
            新しいパスワードを入力してください。
          </p>

          <UFormField label="新しいパスワード" name="newPassword" required>
            <UInput v-model="state.newPassword" type="password" autocomplete="new-password" />
          </UFormField>

          <UFormField label="新しいパスワード（確認）" name="confirmPassword" required>
            <UInput v-model="state.confirmPassword" type="password" autocomplete="new-password" />
          </UFormField>

          <div v-if="config.public.TURNSTILE_SITE_KEY" id="reset-password-turnstile" class="flex justify-center my-4" />

          <UButton type="submit" :loading="loading" block>
            パスワードをリセット
          </UButton>
        </UForm>
      </div>
    </UPageCard>
  </div>
</template>
