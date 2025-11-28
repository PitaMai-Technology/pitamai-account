<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useConfirmDialog } from '~/composable/useConfirmDialog';

definePageMeta({ layout: 'the-app' });

const toast = useToast();

// セッション取得
interface UserInfo {
  name?: string | null;
  image?: string | null;
}
interface GetSessionResponse {
  session?: { user?: { id?: string } | null } | null;
  user?: UserInfo | null;
}
const { data: session } = await useFetch<GetSessionResponse>(
  '/api/auth/get-session',
  { key: 'session' }
);

// プロフィール更新用 state
const profileState = reactive<Partial<UserUpdate>>({
  userId: session?.value?.session?.user?.id ?? '',
  data: {
    name: session?.value?.user?.name ?? undefined,
    image: session?.value?.user?.image ?? undefined,
  },
});
const emailState = reactive<Partial<UserChangeEmailSettings>>({
  newEmail: '',
});

const loading = ref(false);

// 共通確認モーダル
const {
  open: confirmOpen,
  confirm: confirmDialog,
  resolve: resolveConfirm,
} = useConfirmDialog();

// プロフィール更新ハンドラ
async function onSubmitProfile(event?: FormSubmitEvent<UserUpdate>) {
  event?.preventDefault?.();
  if (loading.value) return;

  const confirmedProfile = await confirmDialog();
  if (!confirmedProfile) {
    loading.value = false;
    return;
  }

  // data オブジェクト（必要なキーのみ）
  const payloadData: Partial<Record<string, string>> = {
    name:
      profileState.data?.name && profileState.data.name.trim() !== ''
        ? profileState.data.name.trim()
        : undefined,
    image:
      profileState.data?.image && profileState.data.image.trim() !== ''
        ? profileState.data.image.trim()
        : undefined,
  };

  const parsed = userUpdateSchema.safeParse({
    userId: profileState.userId ?? '',
    data: payloadData,
  });
  if (!parsed.success) {
    toast.add({
      title: '入力エラー',
      description: '少なくとも1つのフィールドを更新してください',
      color: 'error',
    });
    return;
  }

  const confirmed = await confirmDialog();
  if (!confirmed) return;

  loading.value = true;
  try {
    const res = await authClient.updateUser(parsed.data.data);
    if ((res as any)?.error) {
      toast.add({
        title: 'エラー',
        description: res.error?.message ?? '更新に失敗しました',
        color: 'error',
      });
      return;
    }
    toast.add({
      title: '成功',
      description: 'プロフィールを更新しました',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'プロフィール更新に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

// メール変更ハンドラ
async function onSubmitEmail(event?: FormSubmitEvent<UserChangeEmailSettings>) {
  event?.preventDefault?.();
  if (loading.value) return;

  const payload = {
    newEmail: emailState.newEmail ?? '',
  };
  const parsed = userChangeEmailSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => i.message).join(', ');
    toast.add({ title: '入力エラー', description: issues, color: 'error' });
    return;
  }

  const confirmed = await confirmDialog();
  if (!confirmed) return;

  loading.value = true;
  try {
    const res = await authClient.changeEmail({
      newEmail: parsed.data.newEmail,
      callbackURL: '/apps/dashboard',
    });
    if ((res as any)?.error) {
      toast.add({
        title: 'エラー',
        description: res.error?.message ?? 'メール変更に失敗しました',
        color: 'error',
      });
      return;
    }
    toast.add({
      title: '成功',
      description: 'メール変更手続きを開始しました。確認メールを送信しました',
      color: 'success',
    });
  } catch (err: unknown) {
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
      <h1 class="text-xl font-semibold">アカウント設定</h1>
      <div class="mt-4 space-y-4">
        <UForm
          :schema="userUpdateSchema"
          :state="profileState"
          class="space-y-4"
          @submit="onSubmitProfile"
        >
          <UFormField label="名前" name="data.name">
            <UInput v-model="profileState.data!.name" />
          </UFormField>

          <UFormField label="画像 URL" name="data.image">
            <UInput v-model="profileState.data!.image" />
          </UFormField>

          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="loading"
              >更新</UButton
            >
          </div>
        </UForm>

        <hr />
        <h2 class="text-xl font-semibold"
          >アカウントの再設定(メールアドレス)</h2
        >
        <UForm
          :schema="userChangeEmailSchema"
          :state="emailState"
          class="space-y-4"
          @submit="onSubmitEmail"
        >
          <UFormField label="新しいメールアドレス" name="newEmail" required>
            <UInput
              v-model="emailState.newEmail"
              placeholder="new@example.com"
            />
          </UFormField>
          <div class="flex gap-2">
            <UButton
              type="submit"
              color="primary"
              :loading="loading"
              @click="onSubmitEmail"
              >メールアドレスを更新</UButton
            >
          </div>
        </UForm>
      </div>
    </AppBackgroundCard>

    <LazyTheConfirmModal
      :open="confirmOpen"
      title="確認"
      message="この操作を実行してよいですか？"
      @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)"
    />
  </div>
</template>

<style scoped></style>
