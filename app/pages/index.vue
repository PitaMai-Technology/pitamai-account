<script setup lang="ts">
import { z } from 'zod';
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';

const toast = useToast();
const loading = ref(false);
const emailSent = ref(false);
const session = authClient.useSession();

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'メールアドレス',
    placeholder: 'user@email.com',
    required: true,
  },
  {
    name: 'name',
    type: 'text',
    label: '名前（任意）',
    placeholder: 'your-name',
    required: false,
  },
];

const schema = z.object({
  email: z.email('有効なメールアドレスを入力してください'),
  name: z.string().optional(),
});

const onSignOut = async () => {

  loading.value = true;
  try {
    await authClient.signOut();
    toast.add({
      title: '成功',
      description: 'ログアウトしました。',
      color: 'success',
    });
  } catch (err) {
    console.error('Sign out error:', err);
    const errorMessage =
      err instanceof Error
        ? err.message
        : 'エラーが発生しました。もう一度お試しください。';
    toast.add({
      title: 'エラー',
      description: errorMessage,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
};

type Schema = z.output<typeof schema>;

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;
  try {
    const { error } = await authClient.signIn.magicLink({
      email: event.data.email,
      name: event.data.name,
      callbackURL: '/apps/dashboard',
      newUserCallbackURL: '/apps/dashboard?welcome=true',
      errorCallbackURL: '/error?',
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
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <UHeader title="Nuxt UI">
      <template #right>
        <template v-if="session.data">
          <UButton to="/apps/dashboard" target="_blank">ダッシュボード</UButton>
          <UButton icon="i-lucide-log-out" @click="onSignOut">
            ログアウト
          </UButton>
        </template>
      </template>
    </UHeader>
    <div class="flex min-h-screen items-center justify-center p-4">
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
        <UAuthForm v-else :schema="schema" :fields="fields" :loading="loading" title="ログイン"
          description="メールアドレスにログインリンクを送信します" icon="i-lucide-mail" :submit="{ label: 'ログインリンクを送信' }"
          @submit="onSubmit" />
      </UPageCard>
    </div>
  </div>
</template>
