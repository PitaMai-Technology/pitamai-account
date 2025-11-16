<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';

const schema = z.object({
  name: z.string('組織名を入力してください'),
  slug: z
    .string('スラッグを入力してください')
    .regex(/^[a-zA-Z0-9-]+$/, '英数字とハイフンのみ使用できます'),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  name: '',
  slug: '',
});

const loading = ref(false); // 追加

const toast = useToast();
async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return; // 二重送信防止
  loading.value = true;
  try {
    const { error } = await authClient.organization.create({
      name: event.data.name, // required
      slug: event.data.slug, // required
    });
    if (error) {
      toast.add({
        title: 'エラー',
        description: `組織作成に失敗しました: ${error.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: '成功',
        description: '組織作成に成功しました。組織にログインしてください。',
        color: 'success',
      });
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      toast.add({
        title: 'エラー',
        description: `組織作成中にエラーが発生しました: ${e.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: `組織作成中に予期しないエラーが発生しました`,
        color: 'error',
      });
    }
  } finally {
    loading.value = false;
  }
}

const session = authClient.useSession();
</script>

<template>
  <div>
    <h1 v-if="session.data">ようこそ、{{ session.data.user.name }}さん</h1>
    <h1 class="text-5xl">組織作成</h1>
    <UForm :schema="schema" :state="state" class="space-y-4 m-10" @submit="onSubmit">
      <UFormField label="組織名" name="name" required>
        <UInput v-model="state.name" />
      </UFormField>

      <UFormField label="スラッグ" name="slug" class="w-full" required>
        <UInput v-model="state.slug" class="w-full" />
      </UFormField>

      <UButton type="submit" :loading="loading" :disabled="loading">
        送信
      </UButton>
    </UForm>
  </div>
</template>
