<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { storeToRefs } from 'pinia';
import { z } from 'zod';
import { usePageLeaveGuard } from '~/composable/usePageLeaveGuard';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();

const schema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string(),
  role: z.enum(['member', 'admins', 'owner']).optional(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: '',
  name: '',
  role: 'member',
});

const loading = ref(false);

// 共通確認モーダル
const confirmStore = useConfirmDialogStore();
const { open: confirmOpen, message: confirmMessage } = storeToRefs(confirmStore);
const { confirm: confirmDialog, resolve: resolveConfirm } = confirmStore;

// ページ離脱ガードを有効化
usePageLeaveGuard('このページから離脱すると、入力中の内容は失われます。よろしいですか？');

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return;
  loading.value = true;

  // モーダルで確認
  const confirmed = await confirmDialog('本当に新規ユーザーを作成しますか？');
  if (!confirmed) {
    loading.value = false;
    return;
  }

  try {
    const created = await $fetch<{
      created: boolean;
      user: {
        id: string;
        email: string;
      };
    }>('/api/pitamai/admin-create-user', {
      method: 'POST',
      body: {
        email: event.data.email,
        name: event.data.name || undefined,
        role: event.data.role || undefined,
      },
    });

    if (!created.created) {
      toast.add({
        title: 'エラー',
        description: 'ユーザー作成に失敗しました。',
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '作成しました',
      description: `${event.data.email} のユーザーを作成しました。対象のユーザーはログイン後に初回パスワード設定が必要です。`,
      color: 'success',
    });

    state.email = '';
    state.name = '';
    state.role = 'member';
  } catch (e: unknown) {
    console.error('account create user error:', e);
    if (e instanceof Error) {
      toast.add({
        title: 'エラー',
        description: e.message,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: 'アカウント作成中に予期しないエラーが発生しました',
        color: 'error',
      });
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="container mx-auto p-4">
    <UPageCard class="mx-auto w-full space-y-6">
      <div>
        <h1 class="text-2xl font-semibold">アカウント作成</h1>
        <p class="mt-2 text-sm text-gray-600">
          管理者権限でユーザーを作成します。初回ログイン後、本人がパスワードを設定します。
        </p>
      </div>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="メールアドレス" name="email" required>
          <UInput v-model="state.email" type="email" placeholder="example@example.com" autocomplete="email" />
        </UFormField>

        <UFormField label="名前（任意）" name="name">
          <UInput v-model="state.name" placeholder="山田 太郎" autocomplete="name" />
        </UFormField>

        <UFormField label="ユーザー全体のロール" name="role">
          <USelect v-model="state.role" :items="[
            { label: 'member (標準)', value: 'member' },
            { label: 'admins', value: 'admins' },
            { label: 'owner', value: 'owner' },
          ]" placeholder="ロールを選択" />
          <p class="mt-1 text-xs text-gray-500">
            未選択または member の場合は標準権限として登録されます。
          </p>
        </UFormField>

        <div class="pt-2 flex justify-end">
          <UButton type="submit" :loading="loading" :disabled="loading">
            ユーザー作成
          </UButton>
        </div>
      </UForm>

      <!-- 確認モーダル -->
      <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage"
        @confirm="() => resolveConfirm(true)" @cancel="() => resolveConfirm(false)" />
    </UPageCard>
  </div>
</template>
