<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { useConfirmDialog } from '~/composable/useConfirmDialog';
import {
  userChangeEmailSchema,
  type UserChangeEmail,
} from '~~/shared/types/user-change-email';

definePageMeta({
  layout: 'the-app',
});

const state = reactive<Partial<UserChangeEmail>>({
  userId: '',
  newEmail: '',
});

const loading = ref(false);

// 共通確認モーダル composable
const {
  open: confirmOpen,
  confirm: confirmDialog,
  resolve: resolveConfirm,
} = useConfirmDialog();

const toast = useToast();

async function onSubmit(event?: FormSubmitEvent<UserChangeEmail>) {
  event?.preventDefault?.();
  if (loading.value) return;

  const payload = event?.data ?? state;

  const parsed = userChangeEmailSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => i.message).join(', ');
    toast.add({ title: '入力エラー', description: issues, color: 'error' });
    return;
  }

  const confirmed = await confirmDialog();
  if (!confirmed) return;

  loading.value = true;
  try {
    await $fetch('/api/pitamai/admin-change-email', {
      method: 'POST',
      body: parsed.data,
    });
    toast.add({
      title: '成功',
      description: 'メール変更を実行しました',
      color: 'success',
    });
  } catch (err: unknown) {
    console.error('admin change email error', err);
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'メール変更に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <AppBackgroundCard>
      <h1 class="text-xl font-semibold">管理者: ユーザーのメール変更</h1>
      <div class="mt-4 space-y-4">
        <UForm :schema="userChangeEmailSchema" :state="state" class="space-y-4" @submit="onSubmit">
          <UFormField label="対象ユーザー ID" name="userId" required>
            <UInput v-model="state.userId" placeholder="user-id" />
            <p class="text-xs text-info mt-1">
              <NuxtLink to="/apps/admin/account">全体アカウントの一覧で確認できます。</NuxtLink>
            </p>
          </UFormField>

          <UFormField label="新しいメール" name="newEmail" required>
            <UInput v-model="state.newEmail" placeholder="new@example.com" />
          </UFormField>

          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="loading">メール変更</UButton>
          </div>
        </UForm>
      </div>

      <LazyTheConfirmModal :open="confirmOpen" title="確認" message="このユーザーのメールアドレスを変更してよいですか？"
        @confirm="() => resolveConfirm(true)" @cancel="() => resolveConfirm(false)" />
    </AppBackgroundCard>
  </div>
</template>
