<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useConfirmDialog } from '~/composable/useConfirmDialog';
import {
  organizationDeleteSchema,
  type OrganizationDeleteForm,
} from '~~/shared/types/organization-delete';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
// authClient.useListOrganizations() ではロール情報が取得できないため、
// サーバーサイドでオーナー権限を持つ組織のみを取得するAPIを使用します。
const { data: ownerOrganizations, status } = await useFetch(
  '/api/pitamai/owner-list'
);

const state = reactive<Partial<OrganizationDeleteForm>>({
  organizationId: undefined,
  organizationName: '',
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

// ページ離脱ガードを有効化
registerPageLeaveGuard();

// 選択した組織を取得
const selectedOrg = computed(() => {
  return ownerOrganizations.value?.find(org => org.id === state.organizationId);
});

// 組織名が完全に一致するかチェック
const isNameMatched = computed(() => {
  return selectedOrg.value && state.organizationName === selectedOrg.value.name;
});

// 組織選択が変わったら組織名をリセット
watch(
  () => state.organizationId,
  () => {
    state.organizationName = '';
  }
);

async function onSubmit(_: FormSubmitEvent<OrganizationDeleteForm>) {
  if (loading.value) return;

  if (!state.organizationId) {
    toast.add({
      title: 'エラー',
      description: '組織を選択してください',
      color: 'error',
    });
    return;
  }

  if (!selectedOrg.value) {
    toast.add({
      title: 'エラー',
      description: '選択した組織が見つかりません',
      color: 'error',
    });
    return;
  }

  // 入力された名前が一致するかチェック
  if (!isNameMatched.value) {
    toast.add({
      title: 'エラー',
      description: '組織名が一致しません。正しい組織名を入力してください',
      color: 'error',
    });
    return;
  }

  loading.value = true;

  const confirmed = await confirmDialog('本当にこの組織を削除しますか？この操作は取り消せません。');
  if (!confirmed) {
    loading.value = false;
    return;
  }

  try {
    const { error } = await authClient.organization.delete({
      organizationId: state.organizationId,
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: `組織削除に失敗しました: ${error.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: '成功',
        description: '組織を削除しました。',
        color: 'success',
      });
      // Reset selection
      state.organizationId = undefined;
      state.organizationName = '';
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      toast.add({
        title: 'エラー',
        description: `組織削除中にエラーが発生しました: ${e.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: `組織削除中に予期しないエラーが発生しました`,
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
    <UPageCard class="mx-auto space-y-6">
      <h1 class="text-2xl font-semiboldtext text-red-600">組織を削除</h1>
      <p class="text-gray-500">注意: 組織を削除すると、関連するすべてのデータが失われます。</p>

      <UForm :schema="organizationDeleteSchema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="削除する組織" name="organizationId" required class="w-full min-w-0">
          <div v-if="status === 'pending'" class="flex items-center gap-2">
            <TheLoader />
          </div>
          <div v-else-if="!ownerOrganizations || ownerOrganizations.length === 0" class="text-sm text-gray-500">
            削除可能な組織がありません（オーナー権限を持つ組織のみ削除可能です）
          </div>
          <div v-else class="w-full min-w-0 overflow-hidden">
            <USelect v-model="state.organizationId" :items="ownerOrganizations" label-key="name" value-key="id"
              placeholder="-- 組織を選択 --" class="w-full" />
          </div>
        </UFormField>

        <p class="text-gray-700 font-bold">{{ selectedOrg?.name }}</p>
        <UFormField v-if="state.organizationId" label="確認のため、組織名を入力してください" name="organizationName" required>
          <UInput v-model="state.organizationName" :color="isNameMatched ? 'success' : undefined"
            placeholder="選択した組織の名前を入力" class="w-full" />
        </UFormField>

        <div class="flex justify-end">
          <UButton type="submit" color="error" :loading="loading" :disabled="loading || !state.organizationId || !state.organizationName
            ">
            削除する
          </UButton>
        </div>
      </UForm>
    </UPageCard>

    <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </div>
</template>
