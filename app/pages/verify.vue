<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';

const schema = z.object({
  email: z.string('メールアドレスを入力してください').email('有効なメールアドレスを入力してください'),
  otp: z.string('OTPコードを入力してください').min(6, 'OTPは6文字以上です'),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: '',
  otp: '',
});

const loading = ref(false);
const toast = useToast();

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return;
  loading.value = true;
  try {
    const { error } = await authClient.emailOtp.verifyEmail({
      email: event.data.email,
      otp: event.data.otp,
    });
    if (error) {
      toast.add({
        title: '認証失敗',
        description: `メール認証に失敗しました: ${error.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: '認証成功',
        description: 'メール認証が完了しました。',
        color: 'success',
      });
    }
  } catch (e: unknown) {
    toast.add({
      title: 'エラー',
      description: e instanceof Error ? e.message : '予期しないエラーが発生しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-4xl mb-6">メール認証</h1>
    <UForm :schema="schema" :state="state" class="space-y-4 m-10" @submit="onSubmit">
      <UFormField label="メールアドレス" name="email" required>
        <UInput v-model="state.email" />
      </UFormField>
      <UFormField label="OTPコード" name="otp" required>
        <UInput v-model="state.otp" />
      </UFormField>
      <UButton type="submit" :loading="loading" :disabled="loading">認証</UButton>
    </UForm>
  </div>
</template>
