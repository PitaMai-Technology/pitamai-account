<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import type { z } from 'zod';
import { registerRequestSchema } from '~~/shared/types/register-request';
import { useConfirmDialogStore } from '~/stores/confirmDialog';
const { $csrfFetch } = useNuxtApp();

definePageMeta({
  layout: 'the-front',
});

const toast = useToast();
const loading = ref(false);

const confirmStore = useConfirmDialogStore();
const { confirm: confirmDialog } = confirmStore;

const state = reactive({
  email: '',
  name: '',
  age: undefined as number | undefined,
  discordId: '',
  agreedToTerms: false,
});

type RegisterSchema = z.output<typeof registerRequestSchema>;

async function onSubmit(event: FormSubmitEvent<RegisterSchema>) {
  // 確認ダイアログを表示
  const confirmed = await confirmDialog('構成員申請を送信しますか？');
  if (!confirmed) return;

  loading.value = true;
  try {
    let response:
      | { success: boolean; request?: { id: string } }
      | undefined;

    try {
      response = await $csrfFetch<{ success: boolean; request?: { id: string } }>('/api/register-user/register', {
        method: 'POST',
        body: event.data,
      });
    } catch (error) {
      console.error('register request failed:', error);
      response = { success: false };
    }

    if (!response?.success) {
      toast.add({
        title: 'エラー',
        description: '申請の送信に失敗しました。',
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '申請を受け付けました',
      description: '管理者が承認するまでログインできません。',
      color: 'success',
    });

    await navigateTo('/thanks?from=register');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex items-center justify-center p-4">
    <UPageCard class="w-full max-w-2xl">
      <div class="space-y-4">
        <div>
          <h1 class="text-2xl font-semibold mb-4">ピタマイ・テクノロジー 構成員申請フォーム</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            申請が承認されるまでログインはできません。
          </p>
          <ul class="mt-6 list-disc list-inside text-md text-gray-600 dark:text-gray-300">
            <li>
              <ULink to="https://wiki.pitamai.com/s/9ec0829c-02a5-402a-ba17-347400fc2e16" target="_blank"
                class="underline hover:text-gray-800">PitaMaiアカウントの利用規約</ULink>
            </li>
            <li>
              <ULink
                to="https://wiki.pitamai.com/s/401f5d89-efe8-49aa-b88f-423a26515851/doc/44ou44k44oe44kk44o744og44kv44oo44ot44k444o8iombiwwtuimje0hcao5a6a5qykq-9bpzeGP6OG"
                target="_blank" class="underline hover:text-gray-800">運営規約</ULink>
            </li>
            <li>
              <ULink to="https://wiki.pitamai.com/s/7fb52506-1f33-4aa7-b3e6-3db6b48b919b" target="_blank"
                class="underline hover:text-gray-800">プライバシーポリシー</ULink>
            </li>
          </ul>
        </div>

        <UForm :schema="registerRequestSchema" :state="state" class="space-y-4" @submit="onSubmit"
          @keydown.enter.prevent>
          <UFormField label="メールアドレス" name="email" required>
            <UInput v-model="state.email" type="email" placeholder="user@example.com" autocomplete="email" />
          </UFormField>

          <UFormField label="名前(ニックネーム可)" name="name" required>
            <UInput v-model="state.name" type="text" placeholder="こばC" autocomplete="name" />
          </UFormField>

          <UFormField label="年齢" name="age" required>
            <UInput v-model="state.age" type="number" min="1" max="150" placeholder="18" />
          </UFormField>

          <UFormField label="Discord ユーザー名" name="discordId" required>
            <UInput v-model="state.discordId" type="text" placeholder="例: otusoa" />
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Discordのユーザー名を入力してください。@マークはなしで大丈夫です。
            </p>
          </UFormField>

          <UFormField name="agreedToTerms" required>
            <UCheckbox v-model="state.agreedToTerms" label="運営規約、PitaMaiアカウントの利用規約とプライバシーポリシーに同意します" />
          </UFormField>

          <USeparator class="my-6" />

          <UAlert color="warning" class="w-full" description="現在、構成員申請は一時的に受け付けていません。申請が再開されるまでお待ちください。" />

          <div class="flex justify-center gap-2">
            <!-- 現在一時的に受け付けしていないため、一時的に無効化 -->
            <UButton type="submit" disabled :loading="loading" block>
              申請する
            </UButton>
          </div>
        </UForm>
      </div>
      <TheConfirmModal />
    </UPageCard>
  </div>
</template>