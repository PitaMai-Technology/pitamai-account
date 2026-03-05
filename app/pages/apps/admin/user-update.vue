<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { storeToRefs } from 'pinia';
import { usePageLeaveGuard } from '~/composable/usePageLeaveGuard';
import { useConfirmDialogStore } from '~/stores/confirmDialog';
import { userUpdateSchema, type UserUpdate } from '~~/shared/types/user-update';

definePageMeta({
  layout: 'the-app',
});

const state = reactive<Partial<UserUpdate>>({
  userId: '',
  data: {
    name: undefined,
    image: undefined,
  },
});

const loading = ref(false);

// 共通確認モーダル
const confirmStore = useConfirmDialogStore();
const { open: confirmOpen, message: confirmMessage } = storeToRefs(confirmStore);
const { confirm: confirmDialog, resolve: resolveConfirm } = confirmStore;

// ページ離脱ガードを有効化
usePageLeaveGuard('このページから離脱すると、入力中の内容は失われます。よろしいですか？');

const toast = useToast();

async function onSubmit(event?: FormSubmitEvent<UserUpdate>) {
  event?.preventDefault?.();
  if (loading.value) return;

  // UForm が schema に基づいて検証済みのデータを event.data に渡す想定
  const payload = event?.data ?? state;

  // 確認ダイアログ
  const confirmed = await confirmDialog('選択したユーザー情報を更新しますか？');
  if (!confirmed) return;

  loading.value = true;
  try {
    await $fetch('/api/pitamai/admin-update-user', {
      method: 'POST',
      body: payload,
    });
    toast.add({
      title: '成功',
      description: 'ユーザー情報を更新しました',
      color: 'success',
    });
  } catch (e: unknown) {
    console.error('admin update error', e);
    toast.add({
      title: 'エラー',
      description:
        e instanceof Error ? e.message : 'ユーザー更新に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AppBackgroundCard>
    <h1 class="text-xl font-semibold">管理者: ユーザー情報更新</h1>
    <div class="mt-4 space-y-4">
      <UForm :schema="userUpdateSchema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="対象ユーザー ID" name="userId" required>
          <UInput v-model="state.userId" placeholder="user-id" />
          <p class="text-xs text-info mt-1">
            <NuxtLink to="/apps/admin/account">全体アカウントの一覧で確認できます。</NuxtLink>
          </p>
        </UFormField>

        <UFormField label="名前" name="data.name">
          <UInput v-model="state.data!.name" />
        </UFormField>

        <UFormField label="画像 URL" name="data.image">
          <UInput v-model="state.data!.image" />
        </UFormField>

        <div class="flex gap-2">
          <UButton type="submit" color="primary" :loading="loading">更新</UButton>
        </div>
      </UForm>
    </div>

    <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </AppBackgroundCard>
</template>

<style scoped></style>
