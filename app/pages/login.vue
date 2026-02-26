<script setup lang="ts">
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';

definePageMeta({
  layout: 'the-front',
});

const toast = useToast();
const loading = ref(false);
const emailSent = ref(false);
const session = authClient.useSession();
const { config, turnstileToken, resetTurnstileToken } = useTurnstile('login-turnstile');

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'メールアドレス',
    placeholder: 'user@email.com',
    required: true,
    autocomplete: 'email',
  },
];

// shared/types/auth.ts から自動インポートされる
type Schema = MagicLinkForm;

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  loading.value = true;
  try {
    const { error } = await authClient.signIn.magicLink({
      email: event.data.email,
      callbackURL: '/apps/dashboard',
      newUserCallbackURL: '/apps/dashboard?welcome=true',
      errorCallbackURL: '/error',
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      console.error('Magic link error:', error);
      let errorMessage = 'エラーが発生しました。もう一度お試しください。';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.status === 400) {
        errorMessage = 'メールアドレスの形式が正しくありません。';
      } else if (error.status === 500) {
        errorMessage =
          'サーバーエラーが発生しました。しばらくしてからお試しください。';
      }
      toast.add({
        title: 'エラー',
        description: errorMessage,
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }
    emailSent.value = true;
    toast.add({
      title: '送信完了',
      description: 'マジックリンクを送信しました。メールを確認してください。',
      color: 'success',
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    const errorMessage =
      err instanceof Error
        ? err.message
        : 'エラーが発生しました。もう一度お試しください。';
    toast.add({
      title: 'エラー',
      description: errorMessage,
      color: 'error',
    });
    resetTurnstileToken();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div v-if="session.data" class="flex items-center justify-center p-4">
      <UPageCard class="w-full max-w-md">
        <div class="flex flex-col items-center space-y-4 py-8">
          <UIcon name="i-lucide-check-circle" class="h-16 w-16 text-success" />
          <h2 class="text-xl font-semibold">ログイン済みです</h2>
          <p class="text-center text-gray-600">
            ようこそ、{{ session.data.user.name }}さん
          </p>
          <UButton to="/apps/dashboard" color="primary">
            ダッシュボードへ移動
          </UButton>
        </div>
      </UPageCard>
    </div>
    <div class="flex items-center justify-center p-4">
      <UPageCard class="w-full max-w-md">
        <div v-if="emailSent" class="flex flex-col items-center space-y-4 py-8">
          <UIcon name="i-lucide-mail-check" class="h-16 w-16 text-success" />
          <h2 class="text-xl font-semibold">メールを送信しました</h2>
          <p class="text-center text-gray-600">
            受信トレイを確認して、ログインリンクをクリックしてください。
          </p>
          <UButton variant="ghost" @click="emailSent = false">
            別のメールアドレスでログイン
          </UButton>
        </div>
        <UAuthForm v-else :schema="magicLinkFormSchema" :fields="fields" :loading="loading" title="ログイン"
          description="メールアドレスにログインリンクを送信します" icon="i-lucide-mail" :submit="{ label: 'ログインリンクを送信' }"
          @submit="onSubmit" />
        <div v-if="config.public.TURNSTILE_SITE_KEY" id="login-turnstile" class="mt-4 flex justify-center" />
      </UPageCard>
    </div>
  </div>
</template>
