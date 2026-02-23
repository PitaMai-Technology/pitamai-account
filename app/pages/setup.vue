<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';

definePageMeta({
  layout: 'the-front',
});

const toast = useToast();
const loading = ref(false);
const setupCompleted = ref(false);

const schema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().min(1, '名前を入力してください').optional(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: undefined,
  name: undefined,
});

const { data, error } = await useFetch('/api/setup/status');

if (error.value) {
  throw createError({
    statusCode: 500,
    statusMessage: 'セットアップ状態の取得に失敗しました',
  });
}

// if (data.value?.isSetupCompleted) {
//   await navigateTo('/login');
// }

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return;

  loading.value = true;
  try {
    await $fetch('/api/setup/owner', {
      method: 'POST',
      body: {
        email: event.data.email,
        name: event.data.name,
      },
    });

    setupCompleted.value = true;
    toast.add({
      title: 'セットアップ完了',
      description: 'owner を作成しました。ログイン画面へ移動します。',
      color: 'success',
    });

    await navigateTo('/login');
  } catch (e: unknown) {
    const errorMessage =
      e instanceof Error
        ? e.message
        : 'セットアップに失敗しました。時間をおいて再度お試しください。';

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
  <div class="flex items-center justify-center p-4">
    <UPageCard class="w-full max-w-md">
      <template #title>初回セットアップ</template>
      <template #description>
        最初の owner アカウントを作成します。
      </template>

      <div v-if="setupCompleted" class="py-4 text-sm text-neutral-600">
        セットアップが完了しました。ログインページへ移動します。
      </div>

      <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="メールアドレス" name="email" required>
          <UInput v-model="state.email" type="email" />
        </UFormField>

        <UFormField label="表示名" name="name">
          <UInput v-model="state.name" />
        </UFormField>

        <UButton type="submit" :loading="loading" :disabled="loading">
          owner を作成
        </UButton>
      </UForm>
    </UPageCard>
  </div>
</template>