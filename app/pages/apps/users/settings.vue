<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { storeToRefs } from 'pinia';
import { authClient } from '~/composable/auth-client';
import { usePageLeaveGuard } from '~/composable/usePageLeaveGuard';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({ layout: 'the-app' });

const toast = useToast();

// セッション取得
interface UserInfo {
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
}
interface GetSessionResponse {
  session?: { user?: { id?: string } | null } | null;
  user?: UserInfo | null;
}

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code?: string; message?: string } };

const { data: session } = await useFetch<GetSessionResponse>(
  '/api/auth/get-session',
  { key: 'session' }
);

const emailVerificationLoading = ref(false);
const isEmailVerified = computed(
  () => Boolean(session.value?.user?.emailVerified)
);

type SendVerificationResponse = {
  status: boolean;
  message: string;
};

function getErrorMessage(err: unknown, fallback = '操作に失敗しました'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const eObj = err as Record<string, unknown>;

    // サーバーレスポンスの data.message を優先
    if (typeof eObj.data === 'object' && eObj.data !== null) {
      const data = eObj.data as Record<string, unknown>;
      if (typeof data.message === 'string') return data.message;
    }

    // トップレベルの message フィールド
    if (typeof eObj.message === 'string') return eObj.message;

    // _error フィールド（Nitro エラー形式）
    const errorField = eObj._error;
    if (typeof errorField === 'object' && errorField !== null) {
      const errObj = errorField as Record<string, unknown>;
      if (typeof errObj.message === 'string') return errObj.message;
    }
  }
  return fallback;
}

async function onSendVerificationEmail() {
  if (emailVerificationLoading.value || isEmailVerified.value) return;

  emailVerificationLoading.value = true;
  try {
    const response = await $fetch<SendVerificationResponse>(
      '/api/auth/verification/send',
      {
        method: 'POST',
        body: {
          callbackURL: '/apps/users/settings',
        },
      }
    );

    toast.add({
      title: '確認',
      description: response.message,
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: getErrorMessage(err),
      color: 'error',
    });
  } finally {
    emailVerificationLoading.value = false;
  }
}

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
const mailServerLoading = ref(false);
const imapTestLoading = ref(false);
const smtpTestLoading = ref(false);

const gpgLoading = ref(false);
const gpgDeleteLoading = ref(false);
const gpgPublishLoading = ref(false);
const gpgGenerateName = ref('');
const gpgImportPublicKey = ref('');
const gpgImportPrivateKey = ref('');
const gpgAction = ref<'generate' | 'import'>('generate');
const gpgState = ref<{
  hasKey: boolean;
  key: {
    id: string;
    publicKey: string;
    privateKey: string;
    fingerprint: string;
    email: string;
    createdAt: string;
    updatedAt: string;
  } | null;
}>({ hasKey: false, key: null });

async function loadMailServerSetting() {
  try {
    const response = await $fetch<{
      hasSetting: boolean;
      user: { email: string; name: string };
      setting: {
        username: string;
        imapHost: string;
        imapPort: number;
        imapSecure: boolean;
        smtpHost: string;
        smtpPort: number;
        smtpSecure: boolean;
      } | null;
    }>('/api/pitamai/mail/settings');

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
    }
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'メールサーバー設定の取得に失敗しました',
      color: 'error',
    });
  }
}

async function onSubmitMailServer() {
  if (mailServerLoading.value) return;

  const confirmed = await confirmDialog('メールサーバー設定を保存しますか？');
  if (!confirmed) return;

  mailServerLoading.value = true;
  try {
    await $fetch('/api/pitamai/mail/settings', {
      method: 'POST',
      body: {
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
      description: 'メールサーバー設定を保存しました',
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

async function onTestImapConnection() {
  if (imapTestLoading.value) return;

  imapTestLoading.value = true;
  try {
    await $fetch('/api/pitamai/mail/imap-test');
    toast.add({
      title: '接続成功',
      description: 'IMAPサーバーに接続できました',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: '接続失敗',
      description:
        err instanceof Error ? err.message : 'IMAPサーバー接続テストに失敗しました',
      color: 'error',
    });
  } finally {
    imapTestLoading.value = false;
  }
}

async function onTestSmtpConnection() {
  if (smtpTestLoading.value) return;

  smtpTestLoading.value = true;
  try {
    await $fetch('/api/pitamai/mail/smtp-test');
    toast.add({
      title: '接続成功',
      description: 'SMTPサーバーに接続できました',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: '接続失敗',
      description:
        err instanceof Error ? err.message : 'SMTPサーバー接続テストに失敗しました',
      color: 'error',
    });
  } finally {
    smtpTestLoading.value = false;
  }
}

async function loadGpgKey() {
  try {
    const response = await $fetch<{
      hasKey: boolean;
      key: {
        id: string;
        publicKey: string;
        privateKey: string;
        fingerprint: string;
        email: string;
        createdAt: string;
        updatedAt: string;
      } | null;
    }>('/api/pitamai/mail/gpg-key');

    gpgState.value = response;
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'GPG鍵の取得に失敗しました',
      color: 'error',
    });
  }
}

async function onSaveGpgKey() {
  if (gpgLoading.value) return;

  const confirmed = await confirmDialog('GPG鍵を保存しますか？');
  if (!confirmed) return;

  gpgLoading.value = true;
  try {
    if (gpgAction.value === 'generate') {
      const name = gpgGenerateName.value.trim() || session.value?.user?.name || session.value?.user?.email || 'PitaMai User';
      await $fetch('/api/pitamai/mail/gpg-key', {
        method: 'POST',
        body: {
          action: 'generate',
          name,
        },
      });
    } else {
      await $fetch('/api/pitamai/mail/gpg-key', {
        method: 'POST',
        body: {
          action: 'import',
          publicKey: gpgImportPublicKey.value,
          privateKey: gpgImportPrivateKey.value,
        },
      });
    }

    toast.add({
      title: '成功',
      description: 'GPG鍵を保存しました',
      color: 'success',
    });

    gpgImportPublicKey.value = '';
    gpgImportPrivateKey.value = '';
    await loadGpgKey();
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'GPG鍵の保存に失敗しました',
      color: 'error',
    });
  } finally {
    gpgLoading.value = false;
  }
}

async function onDeleteGpgKey() {
  if (gpgDeleteLoading.value) return;

  const confirmed = await confirmDialog('GPG鍵を削除しますか？');
  if (!confirmed) return;

  gpgDeleteLoading.value = true;
  try {
    await $fetch('/api/pitamai/mail/gpg-key', {
      method: 'DELETE',
    });

    toast.add({
      title: '成功',
      description: 'GPG鍵を削除しました',
      color: 'success',
    });

    await loadGpgKey();
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : 'GPG鍵の削除に失敗しました',
      color: 'error',
    });
  } finally {
    gpgDeleteLoading.value = false;
  }
}

async function onPublishGpgKey() {
  if (gpgPublishLoading.value) return;

  const confirmed = await confirmDialog(
    '公開鍵サーバーに公開申請しますか？確認メールが届いた場合は承認が必要です。'
  );
  if (!confirmed) return;

  gpgPublishLoading.value = true;
  try {
    const result = await $fetch<{
      ok: boolean;
      message: string;
      keyServer: string;
    }>('/api/pitamai/mail/gpg-key-publish', {
      method: 'POST',
    });

    toast.add({
      title: '公開申請を送信しました',
      description: result.message,
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description:
        err instanceof Error ? err.message : '公開申請に失敗しました',
      color: 'error',
    });
  } finally {
    gpgPublishLoading.value = false;
  }
}

async function onCopyGpgPublicKey() {
  const publicKey = gpgState.value.key?.publicKey;
  if (!publicKey) return;

  try {
    await navigator.clipboard.writeText(publicKey);
    toast.add({
      title: 'コピーしました',
      description: '公開鍵をクリップボードにコピーしました',
      color: 'success',
    });
  } catch {
    toast.add({
      title: 'エラー',
      description: '公開鍵のコピーに失敗しました',
      color: 'error',
    });
  }
}

const showGpgPrivateKey = ref(false);

async function onCopyGpgPrivateKey() {
  const privateKey = gpgState.value.key?.privateKey;
  if (!privateKey) return;

  try {
    await navigator.clipboard.writeText(privateKey);
    toast.add({
      title: 'コピーしました',
      description: '秘密鍵をクリップボードにコピーしました',
      color: 'success',
    });
  } catch {
    toast.add({
      title: 'エラー',
      description: '秘密鍵のコピーに失敗しました',
      color: 'error',
    });
  }
}

const loading = ref(false);

// 共通確認モーダル
const confirmStore = useConfirmDialogStore();
const { open: confirmOpen, message: confirmMessage } = storeToRefs(confirmStore);
const { confirm: confirmDialog, resolve: resolveConfirm } = confirmStore;

// ページ離脱ガードを有効化
usePageLeaveGuard('このページから離脱すると、入力中の内容は失われます。よろしいですか？');

// プロフィール更新ハンドラ
async function onSubmitProfile(event?: FormSubmitEvent<UserUpdate>) {
  event?.preventDefault?.();
  if (loading.value) return;

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

  const confirmed = await confirmDialog('プロフィールを更新してよろしいですか？');
  if (!confirmed) return;

  loading.value = true;
  try {
    const res: ApiResult<{ status: boolean }> = await authClient.updateUser(parsed.data.data);
    if (res.error) {
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
    newEmail: (emailState.newEmail ?? '').trim(),
  };
  const parsed = userChangeEmailSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => i.message).join(', ');
    toast.add({ title: '入力エラー', description: issues, color: 'error' });
    return;
  }

  const confirmed = await confirmDialog('メールアドレスを更新してよろしいですか？');
  if (!confirmed) return;

  loading.value = true;
  try {
    const res: ApiResult<{ status: boolean }> = await authClient.changeEmail({
      newEmail: parsed.data.newEmail,
      callbackURL: '/apps/dashboard',
    });
    if (res.error) {
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

onMounted(async () => {
  await loadMailServerSetting();
  await loadGpgKey();
});
</script>

<template>
  <div>
    <AppBackgroundCard>
      <h1 class="text-xl font-semibold">アカウント設定</h1>
      <div class="mt-4 space-y-4">
        <div class="rounded border border-gray-200 p-4">
          <h2 class="text-lg font-semibold">メール認証</h2>
          <p class="mt-2 text-sm text-gray-600">
            現在の状態:
            <span class="font-medium" :class="isEmailVerified ? 'text-green-700' : 'text-amber-700'">
              {{ isEmailVerified ? '認証済み' : '未認証' }}
            </span>
          </p>
          <p v-if="session?.user?.email" class="mt-1 text-xs text-gray-500">
            対象メール: {{ session.user.email }}
          </p>
          <div class="mt-3">
            <UButton color="primary" variant="outline" :disabled="isEmailVerified" :loading="emailVerificationLoading"
              @click="onSendVerificationEmail">
              認証メールを送信
            </UButton>
          </div>
        </div>

        <UForm :schema="userUpdateSchema" :state="profileState" class="space-y-4" @submit="onSubmitProfile">
          <UFormField label="名前" name="data.name">
            <UInput v-model="profileState.data!.name" />
          </UFormField>

          <UFormField label="画像 URL" name="data.image">
            <UInput v-model="profileState.data!.image" />
          </UFormField>

          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="loading">更新</UButton>
          </div>
        </UForm>

        <hr />
        <h2 class="text-xl font-semibold">アカウントの再設定(メールアドレス)</h2>
        <UForm :schema="userChangeEmailSettingsSchema" :state="emailState" class="space-y-4" @submit="onSubmitEmail">
          <UFormField label="新しいメールアドレス" name="newEmail" required>
            <UInput v-model="emailState.newEmail" placeholder="new@example.com" />
          </UFormField>
          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="loading">メールアドレスを更新</UButton>
          </div>
        </UForm>

        <hr />
        <UColorModeSelect />
        <h2 class="text-xl font-semibold">メールサーバー設定（個人）</h2>
        <div class="space-y-4">
          <UFormField label="ユーザー名" name="mail.username" required>
            <UInput v-model="mailServerState.username" placeholder="user@example.com" />
          </UFormField>

          <UFormField label="パスワード" name="mail.password">
            <UInput v-model="mailServerState.password" type="password" placeholder="変更しない場合は空欄" />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="IMAP Host" name="mail.imapHost" required>
              <UInput v-model="mailServerState.imapHost" placeholder="imap.example.com" />
            </UFormField>

            <UFormField label="IMAP Port" name="mail.imapPort" required>
              <UInput v-model.number="mailServerState.imapPort" type="number" />
            </UFormField>

            <UFormField label="SMTP Host" name="mail.smtpHost" required>
              <UInput v-model="mailServerState.smtpHost" placeholder="smtp.example.com" />
            </UFormField>

            <UFormField label="SMTP Port" name="mail.smtpPort" required>
              <UInput v-model.number="mailServerState.smtpPort" type="number" />
            </UFormField>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <UCheckbox v-model="mailServerState.imapSecure" label="IMAP Secure (TLS)" />
            <UCheckbox v-model="mailServerState.smtpSecure" label="SMTP Secure (TLS)" />
          </div>

          <div class="flex gap-2">
            <UButton color="primary" :loading="mailServerLoading" @click="onSubmitMailServer">
              メールサーバー設定を保存
            </UButton>
            <UButton color="neutral" variant="outline" :loading="imapTestLoading" @click="onTestImapConnection">
              IMAP接続テスト
            </UButton>
            <UButton color="neutral" variant="outline" :loading="smtpTestLoading" @click="onTestSmtpConnection">
              SMTP接続テスト
            </UButton>
          </div>
          <p class="text-xs text-gray-500">接続テストは保存済み設定を使用します。</p>
        </div>

        <hr />
        <h2 class="text-xl font-semibold">メールの GPG 設定(高度な設定)</h2>
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            メールを PGP 署名して送信するための鍵を管理します。
          </p>

          <div v-if="gpgState.hasKey && gpgState.key" class="rounded border border-gray-200 p-3 space-y-2">
            <p class="text-sm font-medium">登録済み鍵</p>
            <p class="text-xs text-gray-600">Fingerprint: {{ gpgState.key.fingerprint }}</p>
            <p class="text-xs text-gray-600">Email: {{ gpgState.key.email }}</p>
            <UFormField label="公開鍵">
              <UTextarea :model-value="gpgState.key.publicKey" :rows="6" readonly class="w-fit mb-2" />
            </UFormField>
            <div class="flex gap-2 mb-2">
              <UButton color="neutral" variant="outline" size="xs" @click="onCopyGpgPublicKey">
                公開鍵をコピー
              </UButton>
              <UButton color="primary" variant="outline" size="xs" :loading="gpgPublishLoading"
                @click="onPublishGpgKey">
                keyserverへ公開申請
              </UButton>
              <UButton color="error" variant="outline" size="xs" :loading="gpgDeleteLoading" @click="onDeleteGpgKey">
                鍵を削除
              </UButton>
            </div>
            <div class="border-t border-gray-200 pt-3 mt-3">
              <div class="flex items-center justify-between mb-2">
                <p class="text-sm font-medium">秘密鍵</p>
                <UButton color="neutral" variant="ghost" size="xs" @click="showGpgPrivateKey = !showGpgPrivateKey">
                  {{ showGpgPrivateKey ? '隠す' : '表示' }}
                </UButton>
              </div>
              <template v-if="showGpgPrivateKey">
                <UFormField label="">
                  <UTextarea :model-value="gpgState.key.privateKey" :rows="8" readonly
                    class="w-fit mb-2 font-mono text-xs" />
                </UFormField>
                <div class="flex gap-2">
                  <UButton color="neutral" variant="outline" size="xs" @click="onCopyGpgPrivateKey">
                    秘密鍵をコピー
                  </UButton>
                </div>
              </template>
              <p v-else class="text-xs text-gray-500">
                セキュリティのため秘密鍵はデフォルトで非表示です
              </p>
            </div>
          </div>

          <div class="rounded border border-gray-200 p-3 space-y-3">
            <UFormField label="操作">
              <USelect v-model="gpgAction" :items="[
                { label: '鍵ペアを生成', value: 'generate' },
                { label: '既存鍵をインポート', value: 'import' }
              ]" class="w-64" />
            </UFormField>

            <template v-if="gpgAction === 'generate'">
              <UFormField label="表示名（任意）">
                <UInput v-model="gpgGenerateName" placeholder="例: Taro Yamada" />
              </UFormField>
            </template>

            <template v-else>
              <UFormField label="公開鍵" required>
                <UTextarea v-model="gpgImportPublicKey" :rows="6" placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" />
              </UFormField>
              <UFormField label="秘密鍵" required>
                <UTextarea v-model="gpgImportPrivateKey" :rows="8"
                  placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----" />
              </UFormField>
            </template>

            <div class="flex gap-2">
              <UButton color="primary" :loading="gpgLoading" @click="onSaveGpgKey">
                GPG鍵を保存
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </AppBackgroundCard>

    <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </div>
</template>

<style scoped></style>
