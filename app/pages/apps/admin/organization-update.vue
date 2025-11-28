<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useConfirmDialog } from '~/composable/useConfirmDialog';
import {
  organizationUpdateSchema,
  type OrganizationUpdateForm,
} from '~~/shared/types/organization-update';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();

function hideFormButKeepData() {
  // 組織選択を解除してフォームを非表示にするが、state.data はクリアしない
  state.organizationId = undefined;
}

// オーナー権限のある組織一覧をサーバーから取得（削除ページと同じエンドポイントを利用）
// 再取得で同じキャッシュエントリが更新されるように `key` を指定する
const {
  data: ownerOrganizations,
  status,
  refresh: reloadOwnerOrganizations,
} = await useFetch('/api/pitamai/owner-list', {
  key: '/api/pitamai/owner-list',
});

const state = reactive<Partial<OrganizationUpdateForm>>({
  organizationId: undefined,
  data: {
    name: undefined,
    slug: undefined,
    logo: undefined,
  },
});
const loading = ref(false);

// 共通確認モーダル
const {
  open: confirmOpen,
  confirm: confirmDialog,
  resolve: resolveConfirm,
} = useConfirmDialog();

const selectedOrg = computed(() => {
  return ownerOrganizations.value?.find(org => org.id === state.organizationId);
});

// 選択された組織が変わればフォームをプリフィルする
watch(
  () => selectedOrg.value,
  org => {
    if (!org) {
      state.data = {
        name: undefined,
        slug: undefined,
        logo: undefined,
      };
      return;
    }
    // 編集時は現在の値を表示（ユーザーは変更した値のみ送信可能）
    state.data = {
      name: org.name,
      slug: org.slug,
      logo: org.logo ?? undefined,
    };
  },
  { immediate: true }
);

async function onSubmit(event?: FormSubmitEvent<OrganizationUpdateForm>) {
  event?.preventDefault?.();
  if (loading.value) return;

  if (!state.organizationId) {
    toast.add({
      title: 'エラー',
      description: '更新する組織を選択してください',
      color: 'error',
    });
    return;
  }

  // data オブジェクト（必要なキーのみ）
  const payloadData: Partial<OrganizationUpdateForm['data']> = {
    name: state.data?.name,
    slug: state.data?.slug,
    logo: state.data?.logo,
  };

  // バリデーション
  const parsed = organizationUpdateSchema.safeParse({
    organizationId: state.organizationId,
    data: payloadData as OrganizationUpdateForm['data'],
  });

  if (!parsed.success) {
    toast.add({
      title: '入力エラー',
      description: '少なくとも1つのフィールドを更新してください',
      color: 'error',
    });
    return;
  }

  // 確認ダイアログ
  const confirmed = await confirmDialog();
  if (!confirmed) return;

  loading.value = true;
  try {
    const { error } = await authClient.organization.update({
      organizationId: state.organizationId,
      data: payloadData as OrganizationUpdateForm['data'],
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: `組織の更新に失敗しました: ${error.message}`,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '成功',
      description: '組織情報を更新しました',
      color: 'success',
    });

    // 更新後、オーナー組織一覧を再取得してフォームを非表示にする（データは保持）
    await refreshOwnerOrganizations();
    hideFormButKeepData();
  } catch (err: unknown) {
    console.error('organization.update unexpected error:', err);
    toast.add({
      title: 'エラー',
      description: err instanceof Error ? err.message : '予期しないエラー',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function refreshOwnerOrganizations() {
  // オーナー組織一覧を再取得して `ownerOrganizations` ref を更新するために useFetch の refresh 関数を使う
  await reloadOwnerOrganizations();
}

function resetForm() {
  if (selectedOrg.value) {
    state.data = {
      name: selectedOrg.value.name,
      slug: selectedOrg.value.slug,
      logo: selectedOrg.value.logo ?? undefined,
    };
  } else {
    state.organizationId = undefined;
    state.data = {
      name: undefined,
      slug: undefined,
      logo: undefined,
    };
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold mb-4">組織情報の更新</h1>
    <UPageCard class="mx-auto w-full space-y-6">
      <UForm
        :schema="organizationUpdateSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="組織を選択" name="organizationId" required>
          <div v-if="status === 'pending'" class="flex items-center gap-2">
            <TheLoader />
          </div>
          <div
            v-else-if="!ownerOrganizations || ownerOrganizations.length === 0"
            class="text-sm text-gray-500"
          >
            更新可能な組織がありません（オーナー権限が必要です）
          </div>
          <div v-else class="w-full min-w-0 overflow-hidden">
            <USelect
              v-model="state.organizationId"
              :items="ownerOrganizations"
              label-key="name"
              value-key="id"
              class="w-full max-w-full truncate"
              placeholder="-- 組織を選択 --"
            />
          </div>
        </UFormField>

        <template v-if="state.organizationId">
          <UFormField label="名前" name="data.name">
            <UInput v-model="state.data!.name" class="w-full" />
          </UFormField>

          <UFormField label="スラッグ" name="data.slug">
            <UInput v-model="state.data!.slug" class="w-full" />
          </UFormField>

          <UFormField label="ロゴURL" name="data.logo">
            <UInput
              v-model="state.data!.logo"
              class="w-full"
              placeholder="https://..."
            />
          </UFormField>
        </template>

        <div class="flex gap-2 justify-end">
          <UButton
            type="button"
            variant="outline"
            :disabled="loading"
            @click="resetForm"
            >編集前にリセット</UButton
          >
          <UButton
            type="submit"
            color="primary"
            :loading="loading"
            :disabled="!state.organizationId"
          >
            更新する
          </UButton>
        </div>
      </UForm>
    </UPageCard>

    <LazyTheConfirmModal
      :open="confirmOpen"
      title="確認"
      message="この組織情報を更新しますか？"
      @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)"
    />
  </div>
</template>
