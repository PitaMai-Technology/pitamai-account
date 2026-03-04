<script setup lang="ts">
import { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';
import { meta } from 'zod/v4/core';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const { config, turnstileToken, resetTurnstileToken } = useTurnstile(
  'password-setup-turnstile'
);

const { data: status, refresh } = await useFetch<{
  email: string;
  mustSetPassword: boolean;
}>('/api/pitamai/password/setup-status', {
  key: 'password-setup-status',
});

if (import.meta.server) {
  if (status.value && !status.value.mustSetPassword) {
    await navigateTo('/apps/dashboard');
  }
}

const otpSending = ref(false);
const passwordSetting = ref(false);
const otpSent = ref(false);

const state = reactive({
  otp: '',
  password: '',
  confirmPassword: '',
});

const schema = z
  .object({
    otp: z.string().length(6, '6桁の認証コードを入力してください'),
    password: z.string().min(8, '8文字以上で入力してください'),
    confirmPassword: z.string().min(8, '確認用パスワードを入力してください'),
  })
  .refine(values => values.password === values.confirmPassword, {
    message: '確認用パスワードが一致しません',
    path: ['confirmPassword'],
  });

type Schema = z.output<typeof schema>;

async function onSendOtp() {
  if (!status.value?.email || otpSending.value) return;
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  otpSending.value = true;
  try {
    const { error } = await authClient.emailOtp.requestPasswordReset({
      email: status.value.email,
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

    otpSent.value = true;
    toast.add({
      title: '送信完了',
      description: 'パスワード設定用の認証コードを送信しました。',
      color: 'success',
    });
  } catch (e: unknown) {
    toast.add({
      title: 'エラー',
      description:
        e instanceof Error
          ? e.message
          : '認証コード送信に失敗しました',
      color: 'error',
    });
  } finally {
    otpSending.value = false;
  }
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!status.value?.email || passwordSetting.value) return;
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  passwordSetting.value = true;
  try {
    const { error } = await authClient.emailOtp.resetPassword({
      email: status.value.email,
      otp: event.data.otp,
      password: event.data.password,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: error.message ?? 'パスワード設定に失敗しました',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    try {
      await $fetch('/api/pitamai/password/setup-complete', {
        method: 'POST',
      });
    } catch (setupError: unknown) {
      console.error('setup-complete failed:', setupError);
      // パスワードは変更済みなので、警告を表示してダッシュボードへ
      toast.add({
        title: '警告',
        description: 'パスワードは設定されましたが、状態の更新に失敗しました。',
        color: 'warning',
      });
    }

    toast.add({
      title: '設定完了',
      description: '初回パスワード設定が完了しました。',
      color: 'success',
    });

    await navigateTo('/apps/dashboard');
  } catch (e: unknown) {
    toast.add({
      title: 'エラー',
      description:
        e instanceof Error ? e.message : 'パスワード設定に失敗しました',
      color: 'error',
    });
  } finally {
    passwordSetting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md p-4">
    <UPageCard class="space-y-4">
      <div>
        <h1 class="text-xl font-semibold">初回パスワード設定</h1>
        <p class="mt-1 text-sm text-gray-600">
          セキュリティのため、最初にパスワードを設定してください。
        </p>
      </div>

      <p v-if="status?.email" class="text-sm text-gray-600">
        対象メール: {{ status.email }}
      </p>

      <UButton :loading="otpSending" :disabled="otpSending || !status?.email" @click="onSendOtp">
        設定用認証コードを送信
      </UButton>

      <UForm v-if="otpSent" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="認証コード" name="otp" required>
          <UInput v-model="state.otp" maxlength="6" placeholder="123456" />
        </UFormField>

        <UFormField label="新しいパスワード" name="password" required>
          <UInput v-model="state.password" type="password" placeholder="8文字以上" />
        </UFormField>

        <UFormField label="新しいパスワード（確認）" name="confirmPassword" required>
          <UInput v-model="state.confirmPassword" type="password" placeholder="確認用" />
        </UFormField>

        <UButton type="submit" :loading="passwordSetting" :disabled="passwordSetting">
          パスワードを設定する
        </UButton>
      </UForm>

      <div v-if="config.public.TURNSTILE_SITE_KEY" id="password-setup-turnstile" class="mt-2 flex justify-center" />
    </UPageCard>
  </div>
</template>
