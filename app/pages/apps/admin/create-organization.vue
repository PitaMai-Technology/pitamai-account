<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useConfirmDialog } from '~/composable/useConfirmDialog';
import { organizationCreateSchema, type OrganizationCreateForm } from '~~/shared/types/organization-create';

definePageMeta({
  layout: 'the-app',
});

const state = reactive<Partial<OrganizationCreateForm>>({
  name: '',
  slug: '',
});

const loading = ref(false);

// 共通確認モーダル composable
const { open: confirmOpen, confirm: confirmDialog, resolve: resolveConfirm } = useConfirmDialog();

const toast = useToast();
async function onSubmit(event: FormSubmitEvent<OrganizationCreateForm>) {
  if (loading.value) return; // 二重送信防止
  loading.value = true;

  const confirmed = await confirmDialog();
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

const session = authClient.useSession();
</script>

<template>
  <div>
    <h1 v-if="session.data">ようこそ、{{ session.data.user.name }}さん</h1>
    <h1 class="text-5xl">組織作成</h1>
    <UForm :schema="organizationCreateSchema" :state="state" class="space-y-4 m-10" @submit="onSubmit">
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

    <ConfirmModal :open="confirmOpen" title="確認" message="本当に組織を作成しますか？" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </div>
</template>
