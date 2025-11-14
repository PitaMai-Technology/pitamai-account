<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';

const schema = z.object({
  name: z.string('名前を入力してください').min(2, '名前は2文字以上です。'),
  email: z.email('メールアドレスを入力してください'),
  password: z
    .string('パスワードを入力してください')
    .min(8, 'パスワードは8文字以上です。'),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  name: undefined,
  email: undefined,
  password: undefined,
});

const config = useRuntimeConfig();
const loading = ref(false); // 追加

const toast = useToast();
async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return; // 二重送信防止
  loading.value = true;
  try {
    const { error } = await authClient.signUp.email({
      name: event.data.name, // required
      email: event.data.email, // required
      password: event.data.password, // required
      callbackURL: config.public.BETTER_AUTH_URL + '/apps/dashboard',
    });
    if (error) {
      toast.add({
        title: 'エラー',
        description: `サインアップに失敗しました: ${error.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: '成功',
        description:
          'サインアップに成功しました。メール認証をしてください。(入力したメールアドレスに確認メールが送信されます)',
        color: 'success',
      });
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      toast.add({
        title: 'エラー',
        description: `サインアップ中にエラーが発生しました: ${e.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: `サインアップ中に予期しないエラーが発生しました`,
        color: 'error',
      });
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-5xl">登録</h1>
    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4 m-10"
      @submit="onSubmit"
    >
      <UFormField label="メールアドレス" name="email" required>
        <UInput v-model="state.email" />
      </UFormField>

      <UFormField label="名前" name="name" required>
        <UInput v-model="state.name" />
      </UFormField>

      <UFormField label="パスワード" name="password" class="w-full" required>
        <UInput v-model="state.password" type="password" class="w-full" />
      </UFormField>

      <UButton type="submit" :loading="loading" :disabled="loading">
        送信
      </UButton>
    </UForm>
  </div>
</template>
