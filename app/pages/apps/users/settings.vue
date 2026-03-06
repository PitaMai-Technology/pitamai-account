<script setup lang="ts">
import type { FormSubmitEvent, TabsItem } from '@nuxt/ui';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const session = authClient.useSession();
const loading = ref(false);
const activeTab = ref('profile');
const resetEmailSent = ref(false);
const { turnstileToken, resetTurnstileToken, config } = useTurnstile('settings-turnstile');

const tabItems: TabsItem[] = [
  {
    label: 'プロフィール',
    slot: 'profile',
    icon: "i-lucide-user-cog",
    value: 'profile',
  },
  {
    label: 'パスワード',
    slot: 'password',
    icon: "i-lucide-lock",
    value: 'password',
  },
];

const profileSchema = z.object({
  name: z.string().trim().min(1, '表示名を入力してください'),
  image: z.url('有効なURLを入力してください').trim().optional().or(z.literal('')),
  twitterUrl: z.url('有効なURLを入力してください').trim().optional().or(z.literal('')),
  bio: z.string().trim().optional(),
});

const changeEmailSchema = z.object({
  newEmail: z.email('有効なメールアドレスを入力してください'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'パスワードは最低8文字必要です'),
  newPassword: z.string().min(8, '新しいパスワードは最低8文字必要です'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword'],
});

const resetPasswordSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
});

type ProfileSchema = z.output<typeof profileSchema>;
type ChangeEmailSchema = z.output<typeof changeEmailSchema>;
type ChangePasswordSchema = z.output<typeof changePasswordSchema>;
type ResetPasswordSchema = z.output<typeof resetPasswordSchema>;

const profileState = reactive<ProfileSchema>({
  name: '',
  image: '',
  twitterUrl: '',
  bio: '',
});

const changeEmailState = reactive<ChangeEmailSchema>({
  newEmail: '',
});

const changePasswordState = reactive<ChangePasswordSchema>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const resetPasswordState = reactive<ResetPasswordSchema>({
  email: '',
});

watchEffect(() => {
  const data = session.value.data;
  if (!data?.user) return;
  profileState.name = data.user.name ?? '';
  profileState.image = data.user.image ?? '';
  profileState.twitterUrl = data.user.twitterUrl ?? '';
  profileState.bio = data.user.bio ?? '';
  resetPasswordState.email = data.user.email ?? '';
  changeEmailState.newEmail = '';
});

async function onProfileSubmit(event: FormSubmitEvent<ProfileSchema>) {
  if (loading.value) return;

  loading.value = true;
  try {
    const { error } = await authClient.updateUser({
      name: event.data.name,
      image: event.data.image || undefined,
      twitterUrl: event.data.twitterUrl || undefined,
      bio: event.data.bio || undefined,
    });

    if (error) {
      toast.add({
        title: '更新に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    await authClient.getSession();
    toast.add({
      title: '更新しました',
      color: 'success',
    });
  } finally {
    loading.value = false;
  }
}

async function onChangeEmailSubmit(event: FormSubmitEvent<ChangeEmailSchema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  if (loading.value) return;

  loading.value = true;
  try {
    const { error } = await authClient.changeEmail({
      newEmail: event.data.newEmail,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'メールアドレス変更に失敗しました',
        description: error.message || 'エラーが発生しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    changeEmailState.newEmail = '';
    resetTurnstileToken();
    toast.add({
      title: 'メールアドレスを変更しました',
      description: '新しいメールアドレスで確認メールが送信されました。確認メールをチェックしてください。',
      color: 'success',
    });
  } finally {
    loading.value = false;
  }
}

async function onChangePasswordSubmit(event: FormSubmitEvent<ChangePasswordSchema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  if (loading.value) return;

  loading.value = true;
  try {
    const { error } = await authClient.changePassword({
      newPassword: event.data.newPassword,
      currentPassword: event.data.currentPassword,
      revokeOtherSessions: true,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'パスワード変更に失敗しました',
        description: error.message || 'エラーが発生しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    changePasswordState.currentPassword = '';
    changePasswordState.newPassword = '';
    changePasswordState.confirmPassword = '';
    resetTurnstileToken();

    toast.add({
      title: 'パスワードを変更しました',
      description: '他のセッションはすべてログアウトされました。',
      color: 'success',
    });
  } finally {
    loading.value = false;
  }
}

async function onResetPasswordSubmit(event: FormSubmitEvent<ResetPasswordSchema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  if (loading.value) return;

  loading.value = true;
  try {
    const { error } = await authClient.requestPasswordReset({
      email: event.data.email,
      redirectTo: `${window.location.origin}/reset-password`,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'リクエストに失敗しました',
        description: error.message || 'エラーが発生しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    resetEmailSent.value = true;
    resetTurnstileToken();
    toast.add({
      title: 'メールを送信しました',
      description: 'パスワード再設定用のメールを送信しました。メールをご確認ください。',
      color: 'success',
    });

    setTimeout(() => {
      resetEmailSent.value = false;
    }, 5000);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AppBackgroundCard>
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold">アカウント設定</h1>
        <p class="text-sm text-neutral-500 mt-1">
          認証サーバー利用に必要な基本プロフィールのみ管理できます。
        </p>
      </div>

      <div v-if="config.public.TURNSTILE_SITE_KEY" id="settings-turnstile" class="flex" />

      <UTabs v-model="activeTab" :items="tabItems">
        <template #profile>
          <div class="pt-4">
            <UForm :schema="profileSchema" :state="profileState" class="space-y-4" @submit="onProfileSubmit">
              <UFormField label="メールアドレス">
                <UInput :model-value="session.data?.user?.email ?? ''" disabled />
              </UFormField>

              <UFormField label="表示名" name="name" required>
                <UInput v-model="profileState.name" />
              </UFormField>

              <UFormField label="アイコン画像URL" name="image">
                <UInput v-model="profileState.image" placeholder="https://example.com/avatar.png" />
              </UFormField>

              <UFormField label="Twitter URL" name="twitterUrl">
                <UInput v-model="profileState.twitterUrl" placeholder="https://x.com/username" />
              </UFormField>

              <UFormField label="bio" name="bio">
                <UTextarea v-model="profileState.bio" placeholder="自己紹介" />
              </UFormField>

              <UButton type="submit" :loading="loading">保存</UButton>
            </UForm>

            <USeparator class="my-8" />

            <div class="space-y-4">
              <div>
                <h2 class="font-semibold text-sm mb-2">メールアドレスを変更</h2>
                <p class="text-sm text-neutral-500 mb-4">
                  新しいメールアドレスを入力すると、確認メールが送信されます。
                </p>
              </div>

              <UForm :schema="changeEmailSchema" :state="changeEmailState" class="space-y-4"
                @submit="onChangeEmailSubmit">
                <UFormField label="新しいメールアドレス" name="newEmail" required>
                  <UInput v-model="changeEmailState.newEmail" type="email" autocomplete="email"
                    placeholder="newemail@example.com" />
                </UFormField>

                <UButton type="submit" :loading="loading">メールアドレスを変更</UButton>
              </UForm>
            </div>
          </div>
        </template>

        <template #password>
          <div class="pt-4 space-y-6">

            <UAlert color="warning">
              <template #title>パスワードは基本的に使用しません。</template>
              <p>パスワードレスに移行</p>
            </UAlert>
            <!-- <div class="space-y-4">
              <div>
                <h2 class="font-semibold text-sm mb-2">パスワードを変更</h2>
                <p class="text-sm text-neutral-500 mb-4">
                  現在のパスワードが分かっている場合
                </p>
              </div>

              <UForm :schema="changePasswordSchema" :state="changePasswordState" class="space-y-4"
                @submit="onChangePasswordSubmit">
                <UFormField label="現在のパスワード" name="currentPassword" required>
                  <UInput v-model="changePasswordState.currentPassword" type="password"
                    autocomplete="current-password" />
                </UFormField>

                <UFormField label="新しいパスワード" name="newPassword" required>
                  <UInput v-model="changePasswordState.newPassword" type="password" autocomplete="new-password" />
                </UFormField>

                <UFormField label="新しいパスワード（確認）" name="confirmPassword" required>
                  <UInput v-model="changePasswordState.confirmPassword" type="password" autocomplete="new-password" />
                </UFormField>

                <UButton type="submit" :loading="loading">パスワードを変更</UButton>
              </UForm>
            </div>

            <USeparator class="my-8" />

            <div class="space-y-4">
              <div>
                <h2 class="font-semibold text-sm mb-2">パスワードをリセット</h2>
                <p class="text-sm text-neutral-500 mb-4">
                  パスワードを忘れた場合。メール受信後、リセットリンクから新しいパスワードを設定できます。
                </p>
              </div>

              <div v-if="resetEmailSent" class="p-4 rounded-lg bg-success/10 border border-success/20 text-sm">
                パスワード再設定用のメールを送信しました。メールをご確認ください。
              </div>

              <UForm v-if="!resetEmailSent" :schema="resetPasswordSchema" :state="resetPasswordState" class="space-y-4"
                @submit="onResetPasswordSubmit">
                <UFormField label="メールアドレス" name="email" required>
                  <UInput v-model="resetPasswordState.email" type="email" autocomplete="email" />
                </UFormField>

                <UButton type="submit" :loading="loading">リセットメールを送信</UButton>
              </UForm>
            </div> -->
          </div>
        </template>
      </UTabs>
    </div>
  </AppBackgroundCard>
</template>
