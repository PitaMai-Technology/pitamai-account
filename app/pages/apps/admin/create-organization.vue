<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useConfirmDialog } from '~/composable/useConfirmDialog';
import {
  organizationCreateSchema,
  type OrganizationCreateForm,
} from '~~/shared/types/organization-create';

definePageMeta({
  layout: 'the-app',
});

const state = reactive<Partial<OrganizationCreateForm>>({
  name: '',
  slug: '',
});

const loading = ref(false);

// 共通確認モーダル composable
const {
  open: confirmOpen,
  message: confirmMessage,
  confirm: confirmDialog,
  resolve: resolveConfirm,
  registerPageLeaveGuard,
} = useConfirmDialog();

// ページ離脱ガードを有効化（離脱時専用メッセージ）
registerPageLeaveGuard('このページから離脱すると、入力中の内容は失われます。よろしいですか？');

const toast = useToast();
async function onSubmit(event: FormSubmitEvent<OrganizationCreateForm>) {
  if (loading.value) return; // 二重送信防止
  loading.value = true;

  const confirmed = await confirmDialog('本当に組織を作成しますか？');
  if (!confirmed) {
    loading.value = false;
    return;
  }
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
</script>

<template>
  <div>
    <UPageCard class="mx-auto w-full space-y-6">
      <h1 class="text-2xl font-semibold">組織作成</h1>
      <p class="mt-2 text-sm text-gray-600"> 新たな組織を作成します。 </p>
      <UForm :schema="organizationCreateSchema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="組織名" name="name" required>
          <UInput v-model="state.name" />
        </UFormField>

        <UFormField label="スラッグ" name="slug" required>
          <UInput v-model="state.slug" />
        </UFormField>
        <p class="text-xs text-gray-500 mt-1">名前とは別にシステム内部で識別しやすくするのがslugです。</p>
        <div class="flex justify-end">
          <UButton type="submit" :loading="loading" :disabled="loading">
            送信
          </UButton>
        </div>
      </UForm>

      <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage"
        @confirm="() => resolveConfirm(true)" @cancel="() => resolveConfirm(false)" />
    </UPageCard>
  </div>
</template>
