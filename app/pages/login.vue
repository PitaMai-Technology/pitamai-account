<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
import { useTurnstile } from '~/composable/useTurnstile';
import { captureClientError } from '~/utils/capture-client-error';

definePageMeta({
  layout: 'the-front',
});

const toast = useToast();
const loading = ref(false);
const passkeyLoading = ref(false);
const passkeySupported = ref(false);
const otpFallbackOpen = ref(false);
const otpSent = ref(false);
const session = authClient.useSession();
const route = useRoute();
const {
  showTurnstileWidget,
  turnstileErrorMessage,
  turnstileToken,
  resetTurnstileToken,
  requestTurnstileMount,
} = useTurnstile('login-turnstile', { autoMount: false });

watch(otpFallbackOpen, async open => {
  if (!open) return;

  // UCollapsible の内容がDOMへ反映されてからTurnstileを初期化する。
  // 一度開いた後は unmount-on-hide=false により、閉じても成功トークンを保持できる。
  await nextTick();
  requestTurnstileMount();
});

// useSession はタブへ戻ったときにもセッションを再確認する。
// そのたびにローディング画面へ切り替えるとフォームの DOM まで破棄され、
// まだ完了していない Turnstile ウィジェットも一緒に消えてしまう。
// 全画面ローディングを出すのは、ページを開いた直後の初回確認だけにする。
const hasResolvedInitialSession = ref(false);
const isInitialSessionPending = computed(
  () => session.value.isPending && !hasResolvedInitialSession.value
);

watch(
  () => session.value.isPending,
  isPending => {
    if (!isPending) {
      hasResolvedInitialSession.value = true;
    }
  },
  { immediate: true }
);

const emailState = reactive({
  email: '',
});

const otpState = reactive({
  otp: [] as number[],
});

const emailOtpFormSchema = z.object({
  email: z.email('有効なメールアドレスを入力してください'),
});

const emailOtpVerifySchema = z.object({
  otp: z.array(z.number()).length(6, '6桁の認証コードを入力してください'),
});

type SendOtpSchema = z.output<typeof emailOtpFormSchema>;
type VerifyOtpSchema = z.output<typeof emailOtpVerifySchema>;

onMounted(() => {
  // WebAuthn はブラウザー組み込み API。SSR 中は window を参照できないため、
  // マウント後にだけ対応状況を調べる。
  passkeySupported.value = 'PublicKeyCredential' in window;

  // パスキー非対応ブラウザーでは、利用可能な予備手段を最初から表示する。
  if (!passkeySupported.value) {
    otpFallbackOpen.value = true;
  }
});

function isOAuthFlow() {
  return (
    route.query.oauth_query !== undefined ||
    route.query.sig !== undefined ||
    (route.query.client_id !== undefined &&
      route.query.response_type === 'code')
  );
}

async function moveAfterSignIn() {
  if (isOAuthFlow()) {
    await navigateTo({
      path: '/consent',
      query: route.query,
    });
    return;
  }

  await navigateTo('/apps/dashboard');
}

/**
 * 登録済みパスキーでログインする。
 *
 * autoFill は false にしているため、ページを開いただけでは認証画面を出さない。
 * 利用者が「パスキーでログイン」を押したときだけ WebAuthn を開始する。
 */
async function onPasskeySignIn() {
  if (!passkeySupported.value || passkeyLoading.value || loading.value) return;

  passkeyLoading.value = true;
  try {
    const { error } = await authClient.signIn.passkey({ autoFill: false });

    if (error) {
      const errorCode = 'code' in error ? error.code : undefined;
      const cancelled = errorCode === 'AUTH_CANCELLED';
      if (!cancelled) {
        captureClientError(error, 'passkey.sign-in');
      }

      toast.add({
        title: cancelled
          ? 'パスキー認証を中止しました'
          : 'ログインできませんでした',
        description: cancelled
          ? 'もう一度試す場合は、ボタンを押してください。'
          : 'パスキーでログインできませんでした。時間をおいて、もう一度お試しください。',
        color: cancelled ? 'warning' : 'error',
      });
      return;
    }

    toast.add({
      title: 'ログイン成功',
      description: 'パスキーで本人確認できました。',
      color: 'success',
    });
    await moveAfterSignIn();
  } catch (error) {
    // ブラウザーや認証器が直接例外を返した場合も、画面を壊さず再試行できるようにする。
    const cancelled =
      error instanceof DOMException && error.name === 'NotAllowedError';
    if (!cancelled) {
      captureClientError(error, 'passkey.sign-in');
    }
    toast.add({
      title: cancelled
        ? 'パスキー認証を中止しました'
        : 'ログインできませんでした',
      description: cancelled
        ? 'もう一度試す場合は、ボタンを押してください。'
        : 'このブラウザーまたは端末でパスキーを利用できませんでした。',
      color: cancelled ? 'warning' : 'error',
    });
  } finally {
    passkeyLoading.value = false;
  }
}

async function onSendOtp(event: FormSubmitEvent<SendOtpSchema>) {
  if (!turnstileToken.value) {
    toast.add({
      title: '確認が必要です',
      description: '「ロボットではありません」認証を完了してください。',
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
      captureClientError(error, 'email-otp.send');
      toast.add({
        title: '認証コードを送信できませんでした',
        description: '時間をおいて、もう一度お試しください。',
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
    captureClientError(err, 'email-otp.send');
    toast.add({
      title: '認証コードを送信できませんでした',
      description: '時間をおいて、もう一度お試しください。',
      color: 'error',
    });
    resetTurnstileToken();
  } finally {
    loading.value = false;
  }
}

async function handleVerifyOtp(data: VerifyOtpSchema) {
  loading.value = true;
  try {
    const signInPayload: Parameters<typeof authClient.signIn.emailOtp>[0] = {
      email: emailState.email,
      otp: data.otp.join(''),
    };

    if (!isOAuthFlow()) {
      signInPayload.callbackURL = '/apps/dashboard';
      signInPayload.errorCallbackURL = '/error';
    }

    const { error } = await authClient.signIn.emailOtp(signInPayload);

    if (error) {
      captureClientError(error, 'email-otp.verify');
      toast.add({
        title: '認証に失敗しました',
        description: '認証コードを確認して、もう一度お試しください。',
        color: 'error',
      });
      return;
    }

    toast.add({
      title: 'ログイン成功',
      description: 'ダッシュボードへ移動します。',
      color: 'success',
    });

    await moveAfterSignIn();
  } catch (err) {
    captureClientError(err, 'email-otp.verify');
    toast.add({
      title: '認証に失敗しました',
      description: '認証コードを確認して、もう一度お試しください。',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-center gap-4">
      <img src="/pitamai-only-logo.png" class="h-12" alt="PitaMai Logo" />
      <p class="text-xl font-semibold">共通アカウント</p>
    </div>
    <div v-if="session.data" class="flex items-center justify-center p-4 w-full">
      <UPageCard class="w-max max-w-md">
        <div class="flex flex-col items-center space-y-4 py-8">
          <UIcon name="i-lucide-check-circle" class="h-16 w-16 text-success" />
          <h2 class="text-xl font-semibold">ログイン済みです</h2>
          <p class="text-center">
            ようこそ、{{ session.data.user.name }}さん
          </p>
          <UButton to="/apps/dashboard" color="primary">
            ダッシュボードへ移動
          </UButton>
        </div>
      </UPageCard>
    </div>
    <template v-else-if="isInitialSessionPending">
      <div class="flex items-center justify-center p-4">
        <UPageCard class="w-max max-w-md">
          <div class="flex flex-col items-center space-y-4 py-8">
            <AppThinkingLoading />
            <h2 class="text-xl font-semibold">ローディング中です...</h2>
          </div>
        </UPageCard>
      </div>
    </template>
    <div v-else class="flex items-center justify-center p-4">
      <!-- w-maxをつけないと、overflowする -->
      <UPageCard class="w-max max-w-md">
        <template #body>
          <div class="space-y-4 w-full">
            <div>
              <h2 class="text-xl font-semibold">ログイン</h2>
              <p class="mt-1 text-sm">
                PitaMaiアカウントへようこそ。パスキーでログインができます。
              </p>
              <p class="mt-2 text-sm text-muted">
                初めての方は
                <ULink to="/register" class="underline">新規申請</ULink>
                から申請してください。
              </p>
            </div>

            <UButton icon="i-lucide-key-round" block :loading="passkeyLoading" :disabled="!passkeySupported || loading"
              @click="onPasskeySignIn">
              パスキーでログイン
            </UButton>

            <p v-if="!passkeySupported" class="text-xs text-muted">
              このブラウザーではパスキーを利用できません。認証コードでログインしてください。
            </p>

            <!--
            OTPはパスキーを利用できない場合の予備手段として、初期状態では閉じておく。
            一度開いた内容は破棄せず、Turnstileのウィジェットと成功トークンを維持する。
          -->
          </div>
        </template>
      </UPageCard>
    </div>

    <div class="m-auto flex w-full max-w-md items-center justify-center">
      <UPageCard class="w-full" :ui="{ body: 'w-full' }">
        <template #body>
          <UCollapsible v-model:open="otpFallbackOpen" :unmount-on-hide="false" class="w-full">
            <UButton color="neutral" class="w-full" variant="ghost" block :trailing-icon="otpFallbackOpen
              ? 'i-lucide-chevron-up'
              : 'i-lucide-chevron-down'
              ">
              <span class="flex items-center gap-2">
                メール認証コードでログイン
                <UBadge color="warning" variant="subtle" size="sm">
                  非推奨
                </UBadge>
              </span>
            </UButton>

            <template #content>
              <div class="mt-4 space-y-4 border-t border-muted pt-4">
                <UAlert color="warning" variant="soft" title="メール認証コードは予備のログイン方法です"
                  description="利用できる場合は、フィッシングに強いパスキーでのログインをおすすめします。" />

                <UForm v-if="!otpSent" :schema="emailOtpFormSchema" :state="emailState" class="space-y-4"
                  @submit="onSendOtp" @keydown.enter.prevent>
                  <UFormField label="メールアドレス" name="email" required>
                    <UInput v-model="emailState.email" type="email" placeholder="user@example.com" autocomplete="email"
                      class="w-full" />
                  </UFormField>
                  <UButton type="submit" :loading="loading" block>
                    認証コードを送信
                  </UButton>
                </UForm>

                <UForm v-else :schema="emailOtpVerifySchema" :state="otpState" class="space-y-4"
                  @submit="event => handleVerifyOtp(event.data)">
                  <p class="text-sm">
                    {{ emailState.email }}
                    に送信された6桁コードを入力してください。
                  </p>
                  <UFormField label="認証コード(6桁の数字)" name="otp" required class="flex flex-col items-center">
                    <UPinInput v-model="otpState.otp" type="number" :length="6" otp autofocus @complete="
                      async () => {
                        const result =
                          emailOtpVerifySchema.safeParse(otpState);
                        if (result.success)
                          await handleVerifyOtp(result.data);
                      }
                    " />
                  </UFormField>
                  <div class="flex gap-2">
                    <UButton type="submit" :loading="loading">
                      ログイン
                    </UButton>
                    <UButton type="button" variant="outline" :disabled="loading" @click="() => { otpSent = false }">
                      メールを変更
                    </UButton>
                  </div>
                </UForm>

                <!--
                  CAPTCHAは認証コードを送信する最初の段階だけ表示する。
                  OTP入力へ進んだ後もDOMは残し、メール変更時に同じウィジェットを再利用する。
                -->
                <UAlert v-if="!otpSent && !showTurnstileWidget" color="warning" variant="soft"
                  title="Turnstile を表示できません" :description="turnstileErrorMessage ??
                    'TURNSTILE_SITE_KEY が設定されていません。'
                    " />

                <div v-show="!otpSent" id="login-turnstile" class="flex justify-center" />
              </div>
            </template>
            <template #footer>
              <USeparator class="my-2" />
              <p class="text-xs text-center mt-6">
                ログインすると、<ULink to="https://wiki.pitamai.com/s/9ec0829c-02a5-402a-ba17-347400fc2e16" target="_blank"
                  class="underline hover:text-default">利用規約</ULink>と、<ULink
                  to="https://wiki.pitamai.com/s/7fb52506-1f33-4aa7-b3e6-3db6b48b919b" target="_blank"
                  class="underline hover:text-default">プライバシーポリシー</ULink>に同意したとみなされます。
              </p>
            </template>
          </UCollapsible>
        </template>
      </UPageCard>
    </div>
  </div>
</template>
