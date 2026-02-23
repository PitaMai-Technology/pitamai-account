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
const mailServerLoading = ref(false);

const mailServerState = reactive({
  username: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
});

// 共通確認モーダル
const confirmStore = useConfirmDialogStore();
const { open: confirmOpen, message: confirmMessage } = storeToRefs(confirmStore);
const { confirm: confirmDialog, resolve: resolveConfirm } = confirmStore;

// ページ離脱ガードを有効化
usePageLeaveGuard('このページから離脱すると、入力中の内容は失われます。よろしいですか？');

const toast = useToast();

async function loadAdminMailServerSetting() {
  const targetUserId = (state.userId ?? '').trim();
  if (!targetUserId) return;

  try {
    const response = await $fetch<{
      hasSetting: boolean;
      user: { id: string; email: string; name: string };
      setting: {
        username: string;
        imapHost: string;
        imapPort: number;
        imapSecure: boolean;
        smtpHost: string;
        smtpPort: number;
        smtpSecure: boolean;
      } | null;
    }>('/api/pitamai/admin-mail-settings', {
      query: { userId: targetUserId },
    });

    if (response.setting) {
      mailServerState.username = response.setting.username;
      mailServerState.imapHost = response.setting.imapHost;
      mailServerState.imapPort = response.setting.imapPort;
      mailServerState.imapSecure = response.setting.imapSecure;
      mailServerState.smtpHost = response.setting.smtpHost;
      mailServerState.smtpPort = response.setting.smtpPort;
      mailServerState.smtpSecure = response.setting.smtpSecure;
      mailServerState.password = '';
    } else {
      mailServerState.username = response.user.email;
      mailServerState.imapHost = '';
      mailServerState.imapPort = 993;
      mailServerState.imapSecure = true;
      mailServerState.smtpHost = '';
      mailServerState.smtpPort = 465;
      mailServerState.smtpSecure = true;
      mailServerState.password = '';
    }

    toast.add({
      title: '確認',
      description: response.setting
        ? 'メールサーバー設定を読み込みました'
        : 'メールサーバー設定は未登録です',
      color: 'info',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'メールサーバー設定の取得に失敗しました',
      color: 'error',
    });
  }
}

async function onSubmitAdminMailServer() {
  if (mailServerLoading.value) return;

  const targetUserId = (state.userId ?? '').trim();
  if (!targetUserId) {
    toast.add({
      title: '入力エラー',
      description: '先に対象ユーザーIDを入力してください',
      color: 'error',
    });
    return;
  }

  const confirmed = await confirmDialog('対象ユーザーのメールサーバー設定を保存しますか？');
  if (!confirmed) return;

  mailServerLoading.value = true;
  try {
    await $fetch('/api/pitamai/admin-mail-settings', {
      method: 'POST',
      body: {
        userId: targetUserId,
        username: mailServerState.username,
        password:
          mailServerState.password.trim() === ''
            ? undefined
            : mailServerState.password,
        imapHost: mailServerState.imapHost,
        imapPort: Number(mailServerState.imapPort),
        imapSecure: mailServerState.imapSecure,
        smtpHost: mailServerState.smtpHost,
        smtpPort: Number(mailServerState.smtpPort),
        smtpSecure: mailServerState.smtpSecure,
      },
    });

    mailServerState.password = '';
    toast.add({
      title: '成功',
      description: '対象ユーザーのメールサーバー設定を保存しました',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'メールサーバー設定の保存に失敗しました',
      color: 'error',
    });
  } finally {
    mailServerLoading.value = false;
  }
}

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
          <div class="mt-2">
            <UButton color="neutral" variant="outline" size="xs" @click="loadAdminMailServerSetting">
              このユーザーのメール設定を読み込む
            </UButton>
          </div>
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

      <hr />
      <h2 class="text-xl font-semibold">対象ユーザーのメールサーバー設定</h2>
      <div class="space-y-4">
        <UFormField label="ユーザー名" required>
          <UInput v-model="mailServerState.username" placeholder="user@example.com" />
        </UFormField>

        <UFormField label="パスワード">
          <UInput v-model="mailServerState.password" type="password" placeholder="変更しない場合は空欄" />
        </UFormField>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="IMAP Host" required>
            <UInput v-model="mailServerState.imapHost" placeholder="imap.example.com" />
          </UFormField>

          <UFormField label="IMAP Port" required>
            <UInput v-model.number="mailServerState.imapPort" type="number" />
          </UFormField>

          <UFormField label="SMTP Host" required>
            <UInput v-model="mailServerState.smtpHost" placeholder="smtp.example.com" />
          </UFormField>

          <UFormField label="SMTP Port" required>
            <UInput v-model.number="mailServerState.smtpPort" type="number" />
          </UFormField>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UCheckbox v-model="mailServerState.imapSecure" label="IMAP Secure (TLS)" />
          <UCheckbox v-model="mailServerState.smtpSecure" label="SMTP Secure (TLS)" />
        </div>

        <div class="flex gap-2">
          <UButton color="primary" :loading="mailServerLoading" @click="onSubmitAdminMailServer">
            メールサーバー設定を保存
          </UButton>
        </div>
      </div>
    </div>

    <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </AppBackgroundCard>
</template>

<style scoped></style>
