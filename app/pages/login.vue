<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';

definePageMeta({
  layout: 'the-front',
});

const toast = useToast();
const loading = ref(false);
const otpSent = ref(false);
const session = authClient.useSession();
const route = useRoute();
const { config, turnstileToken, resetTurnstileToken } = useTurnstile('login-turnstile');

const emailState = reactive({
  email: '',
});

const otpState = reactive({
  otp: '',
});

const emailOtpFormSchema = z.object({
  email: z.email('有効なメールアドレスを入力してください'),
});

const emailOtpVerifySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, '6桁の認証コードを入力してください'),
});

type SendOtpSchema = z.output<typeof emailOtpFormSchema>;
type VerifyOtpSchema = z.output<typeof emailOtpVerifySchema>;

async function onSendOtp(event: FormSubmitEvent<SendOtpSchema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  loading.value = true;
  try {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: event.data.email,
      type: 'sign-in',
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    });

    if (error) {
      console.error('Email OTP send error:', error);
      let errorMessage = 'エラーが発生しました。もう一度お試しください。';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.status === 400) {
        errorMessage = 'メールアドレスの形式が正しくありません。';
      } else if (error.status === 500) {
        errorMessage =
          'サーバーエラーが発生しました。しばらくしてからお試しください。';
      }
      toast.add({
        title: 'エラー',
        description: errorMessage,
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    emailState.email = event.data.email;
    otpSent.value = true;
    resetTurnstileToken();
    toast.add({
      title: '送信完了',
      description: '認証コードを送信しました。メールを確認してください。',
      color: 'success',
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    const errorMessage =
      err instanceof Error
        ? err.message
        : 'エラーが発生しました。もう一度お試しください。';
    toast.add({
      title: 'エラー',
      description: errorMessage,
      color: 'error',
    });
    resetTurnstileToken();
  } finally {
    loading.value = false;
  }
}

async function onVerifyOtp(event: FormSubmitEvent<VerifyOtpSchema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」の認証を完了してください。',
      color: 'warning',
    });
    return;
  }

  loading.value = true;
  try {
    const isOAuthFlow =
      route.query.oauth_query !== undefined ||
      route.query.sig !== undefined ||
      (route.query.client_id !== undefined && route.query.response_type === 'code');
    const signInPayload: Parameters<typeof authClient.signIn.emailOtp>[0] = {
      email: emailState.email,
      otp: event.data.otp,
      fetchOptions: {
        headers: {
          'x-captcha-response': turnstileToken.value,
        },
      },
    };

    if (!isOAuthFlow) {
      signInPayload.callbackURL = '/apps/dashboard';
      signInPayload.errorCallbackURL = '/error';
    }

    const { error } = await authClient.signIn.emailOtp(signInPayload);

    if (error) {
      toast.add({
        title: 'エラー',
        description: error.message ?? '認証に失敗しました。コードを確認してください。',
        color: 'error',
      });
      resetTurnstileToken();
      return;
    }

    if (isOAuthFlow) {
      await navigateTo({
        path: '/consent',
        query: route.query,
      });
      return;
    }

    toast.add({
      title: 'ログイン成功',
      description: 'ダッシュボードへ移動します。',
      color: 'success',
    });

    await navigateTo('/apps/dashboard');
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : 'エラーが発生しました。もう一度お試しください。';
    toast.add({
      title: 'エラー',
      description: errorMessage,
      color: 'error',
    });
    resetTurnstileToken();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div v-if="session.data" class="flex items-center justify-center p-4">
      <UPageCard class="w-full max-w-md">
        <div class="flex flex-col items-center space-y-4 py-8">
          <UIcon name="i-lucide-check-circle" class="h-16 w-16 text-success" />
          <h2 class="text-xl font-semibold">ログイン済みです</h2>
          <p class="text-center text-gray-600">
            ようこそ、{{ session.data.user.name }}さん
          </p>
          <UButton to="/apps/dashboard" color="primary">
            ダッシュボードへ移動
          </UButton>
        </div>
      </UPageCard>
    </div>
    <div v-else class="flex items-center justify-center p-4">
      <UPageCard class="w-full max-w-md">
        <div class="space-y-4">
          <div>
            <h2 class="text-xl font-semibold">ログイン</h2>
            <p class="mt-1 text-sm text-gray-600">
              メールアドレス宛に届く認証コードでログインします。
            </p>
          </div>

          <UForm v-if="!otpSent" :schema="emailOtpFormSchema" :state="emailState" class="space-y-4" @submit="onSendOtp">
            <UFormField label="メールアドレス" name="email" required>
              <UInput v-model="emailState.email" type="email" placeholder="user@email.com" autocomplete="email" />
            </UFormField>
            <UButton type="submit" :loading="loading" block>
              認証コードを送信
            </UButton>
          </UForm>

          <UForm v-else :schema="emailOtpVerifySchema" :state="otpState" class="space-y-4" @submit="onVerifyOtp">
            <p class="text-sm text-gray-600">
              {{ emailState.email }} に送信された6桁コードを入力してください。
            </p>
            <UFormField label="認証コード" name="otp" required>
              <UInput v-model="otpState.otp" placeholder="123456" maxlength="6" />
            </UFormField>
            <div class="flex gap-2">
              <UButton type="submit" :loading="loading">ログイン</UButton>
              <UButton type="button" variant="outline" :disabled="loading" @click="otpSent = false">
                メールを変更
              </UButton>
            </div>
          </UForm>

          <div v-if="config.public.TURNSTILE_SITE_KEY" id="login-turnstile" class="mt-4 flex justify-center" />
        </div>
      </UPageCard>
    </div>
  </div>
</template>
