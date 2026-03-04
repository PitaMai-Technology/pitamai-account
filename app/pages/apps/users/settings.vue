<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { storeToRefs } from 'pinia';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';
import { usePageLeaveGuard } from '~/composable/usePageLeaveGuard';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({ layout: 'the-app' });

const toast = useToast();
const serverError = useError();
const { config, turnstileToken, resetTurnstileToken } = useTurnstile(
  'settings-password-reset-turnstile'
);

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
const verifyEmailOtpLoading = ref(false);
const emailVerificationOtp = ref('');
const isEmailVerified = computed(
  () => Boolean(session.value?.user?.emailVerified)
);

async function onSendVerificationEmail() {
  if (emailVerificationLoading.value || isEmailVerified.value) return;

  emailVerificationLoading.value = true;
  try {
    if (!session.value?.user?.email) {
      throw new Error('メールアドレスを取得できませんでした');
    }

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: session.value.user.email,
      type: 'email-verification',
    });

    if (error) {
      throw new Error(error.message ?? '認証コード送信に失敗しました');
    }

    toast.add({
      title: '確認',
      description: '認証コードを送信しました。メールをご確認ください。',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: `${serverError.value?.message} 認証メール送信に失敗しました`,
      color: 'error',
    });
  } finally {
    emailVerificationLoading.value = false;
  }
}

async function onVerifyEmailOtp() {
  if (verifyEmailOtpLoading.value || isEmailVerified.value) return;
  if (!session.value?.user?.email) {
    toast.add({
      title: 'エラー',
      description: 'メールアドレスを取得できませんでした',
      color: 'error',
    });
    return;
  }

  verifyEmailOtpLoading.value = true;
  try {
    const { error } = await authClient.emailOtp.verifyEmail({
      email: session.value.user.email,
      otp: emailVerificationOtp.value,
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: error.message ?? '認証コードの検証に失敗しました',
        color: 'error',
      });
      return;
    }

    emailVerificationOtp.value = '';
    await refreshNuxtData('session');
    toast.add({
      title: '成功',
      description: 'メール認証が完了しました。',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: `${serverError.value?.message} 認証コードの検証に失敗しました`,
      color: 'error',
    });
  } finally {
    verifyEmailOtpLoading.value = false;
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
const passwordResetState = reactive({
  otp: '',
  password: '',
  confirmPassword: '',
});
const passwordResetOtpSent = ref(false);
const passwordResetSendLoading = ref(false);
const passwordResetLoading = ref(false);

async function onSendPasswordResetOtp() {
  if (passwordResetSendLoading.value) return;

  if (!session.value?.user?.email) {
    toast.add({
      title: 'エラー',
      description: 'メールアドレスを取得できませんでした',
      color: 'error',
    });
    return;
  }

  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  passwordResetSendLoading.value = true;
  try {
    const { error } = await authClient.emailOtp.requestPasswordReset({
      email: session.value.user.email,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: error.message ?? '認証コード送信に失敗しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    passwordResetOtpSent.value = true;
    resetTurnstileToken();
    toast.add({
      title: '送信完了',
      description: 'パスワード再設定用の認証コードを送信しました。',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: `${serverError.value?.message} 認証コード送信に失敗しました`,
      color: 'error',
    });
    resetTurnstileToken();
  } finally {
    passwordResetSendLoading.value = false;
  }
}

async function onResetPassword() {
  if (passwordResetLoading.value) return;

  if (!session.value?.user?.email) {
    toast.add({
      title: 'エラー',
      description: 'メールアドレスを取得できませんでした',
      color: 'error',
    });
    return;
  }

  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  if (passwordResetState.password.length < 8) {
    toast.add({
      title: '入力エラー',
      description: '新しいパスワードは8文字以上で入力してください。',
      color: 'warning',
    });
    return;
  }

  if (passwordResetState.password !== passwordResetState.confirmPassword) {
    toast.add({
      title: '入力エラー',
      description: '確認用パスワードが一致しません。',
      color: 'warning',
    });
    return;
  }

  passwordResetLoading.value = true;
  try {
    const { error } = await authClient.emailOtp.resetPassword({
      email: session.value.user.email,
      otp: passwordResetState.otp,
      password: passwordResetState.password,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: error.message ?? 'パスワード再設定に失敗しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    passwordResetState.otp = '';
    passwordResetState.password = '';
    passwordResetState.confirmPassword = '';
    passwordResetOtpSent.value = false;
    resetTurnstileToken();

    toast.add({
      title: '成功',
      description: 'パスワードを再設定しました。',
      color: 'success',
    });
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: `${serverError.value?.message} パスワード再設定に失敗しました`,
      color: 'error',
    });
    resetTurnstileToken();
  } finally {
    passwordResetLoading.value = false;
  }
}

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
      description: `${serverError.value?.message} メールサーバー設定の取得に失敗しました`,
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
      description: `${serverError.value?.message} メールサーバー設定の保存に失敗しました`,
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
      description: `${serverError.value?.message} IMAPサーバー接続テストに失敗しました`,
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
      description: `${serverError.value?.message} SMTPサーバー接続テストに失敗しました`,
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
      description: `${serverError.value?.message} GPG鍵の取得に失敗しました`,
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
      description: `${serverError.value?.message} GPG鍵の保存に失敗しました`,
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
      description: `${serverError.value?.message} GPG鍵の削除に失敗しました`,
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
      description: `${serverError.value?.message} 公開申請に失敗しました`,
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
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: `${serverError.value?.message} 公開鍵のコピーに失敗しました`,
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
  } catch (err: unknown) {
    toast.add({
      title: 'エラー',
      description: `${serverError.value?.message} 秘密鍵のコピーに失敗しました`,
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
      description: `${serverError.value?.message} プロフィール入力内容が不正です`,
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
      description: `${serverError.value?.message} プロフィール更新に失敗しました`,
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
    toast.add({
      title: '入力エラー',
      description: `${serverError.value?.message} メールアドレス入力内容が不正です`,
      color: 'error',
    });
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
      description: `${serverError.value?.message} メール変更に失敗しました`,
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
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            現在の状態:
            <span class="font-medium" :class="isEmailVerified ? 'text-green-700' : 'text-amber-700'">
              {{ isEmailVerified ? '認証済み' : '未認証' }}
            </span>
          </p>
          <p v-if="session?.user?.email" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            対象メール: {{ session.user.email }}
          </p>
          <div class="mt-3">
            <UButton color="primary" variant="outline" :disabled="isEmailVerified" :loading="emailVerificationLoading"
              @click="onSendVerificationEmail">
              認証コードを送信
            </UButton>
          </div>
          <div v-if="!isEmailVerified" class="mt-3 space-y-2">
            <UInput v-model="emailVerificationOtp" placeholder="6桁の認証コード" maxlength="6" />
            <UButton color="primary" :loading="verifyEmailOtpLoading" @click="onVerifyEmailOtp">
              認証コードを確認
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

        <hr class="my-6" />

        <h2 class="text-xl font-semibold">外観設定</h2>

        <p>ダークモード切り替え</p>
        <UColorModeSelect />

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
        <h2 class="text-xl font-semibold">パスワード再設定</h2>
        <div class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            現在のメールアドレス宛に認証コードを送信し、新しいパスワードを設定します。
          </p>
          <div class="flex gap-2">
            <UButton color="primary" variant="outline" :loading="passwordResetSendLoading"
              @click="onSendPasswordResetOtp">
              再設定コードを送信
            </UButton>
          </div>

          <div v-if="passwordResetOtpSent" class="space-y-3">
            <UFormField label="認証コード" required>
              <UInput v-model="passwordResetState.otp" maxlength="6" placeholder="123456" />
            </UFormField>
            <UFormField label="新しいパスワード" required>
              <UInput v-model="passwordResetState.password" type="password" placeholder="8文字以上" />
            </UFormField>
            <UFormField label="新しいパスワード（確認）" required>
              <UInput v-model="passwordResetState.confirmPassword" type="password" placeholder="確認用" />
            </UFormField>
            <UButton color="primary" :loading="passwordResetLoading" @click="onResetPassword">
              パスワードを再設定
            </UButton>
          </div>

          <div v-if="config.public.TURNSTILE_SITE_KEY" id="settings-password-reset-turnstile"
            class="mt-2 flex justify-center" />
        </div>

        <hr />

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
          <p class="text-xs text-gray-500 dark:text-gray-400">接続テストは保存済み設定を使用します。</p>
        </div>

        <hr />
        <h2 class="text-xl font-semibold">メールの GPG 設定(高度な設定)</h2>
        <div class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            メールを PGP 署名して送信するための鍵を管理します。
          </p>

          <div v-if="gpgState.hasKey && gpgState.key" class="rounded border border-gray-200 p-3 space-y-2">
            <p class="text-sm font-medium">登録済み鍵</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">Fingerprint: {{ gpgState.key.fingerprint }}</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">Email: {{ gpgState.key.email }}</p>
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
              <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                セキュリティのため秘密鍵はデフォルトで非表示です。
                右上から「表示」ボタンを押すと内容を確認できますが、取り扱いには十分ご注意ください。
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
