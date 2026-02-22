<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { storeToRefs } from 'pinia';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
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
  const confirmed = await confirmDialog('本当にメールを送信しますか？');
  if (!confirmed) {
    loading.value = false;
    return;
  }

  try {
    // 1. User を事前登録
    const preRegisterRes = await $fetch<{
      id: string;
      email: string;
      created: boolean;
      message?: string;
    }>('/api/pitamai/pre-register', {
      method: 'POST',
      body: {
        email: event.data.email,
        name: event.data.name || undefined,
        role: event.data.role || undefined,
      },
    });

    console.debug('pre-register response:', preRegisterRes);

    // 既存ユーザーの場合はここで終了（Magic Link は送信しない）
    if (!preRegisterRes.created) {
      toast.add({
        title: '既存ユーザー',
        description:
          preRegisterRes.message ??
          'このメールアドレスは既に登録されています。',
        color: 'warning',
      });
      return;
    }

    // 2. Magic Link を送信（新規ユーザーのみ）
    const { error } = await authClient.signIn.magicLink({
      email: event.data.email,
      callbackURL: '/apps/dashboard',
    });

    if (error) {
      console.error('magic link error:', error);
      toast.add({
        title: 'エラー',
        description: `ログインリンクの送信に失敗しました: ${error.message}`,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '送信しました',
      description: `${event.data.email} 宛にログインリンクを送信しました。メールを確認してください。`,
      color: 'success',
    });

    state.email = '';
    state.name = '';
    state.role = 'member';
  } catch (e: unknown) {
    console.error('account pre-register error:', e);
    if (e instanceof Error) {
      toast.add({
        title: 'エラー',
        description: e.message,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: 'アカウント事前登録中に予期しないエラーが発生しました',
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
        <h1 class="text-2xl font-semibold">アカウント事前登録</h1>
        <p class="mt-2 text-sm text-gray-600">
          メールアドレスを事前登録し、ログイン用のマジックリンクを送信します。
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
            ログインリンクを送信
          </UButton>
        </div>
      </UForm>

      <!-- 確認モーダル -->
      <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage"
        @confirm="() => resolveConfirm(true)" @cancel="() => resolveConfirm(false)" />
    </UPageCard>
  </div>
</template>
