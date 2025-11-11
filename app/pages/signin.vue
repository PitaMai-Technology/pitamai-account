<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';

const sendSchema = z.object({
  email: z.email('メールアドレスを入力してください'),
});

const verifySchema = z.object({
  email: z.string('メールアドレスを入力してください').email('有効なメールアドレスを入力してください'),
  otp: z.string('OTPコードを入力してください').min(6, 'OTPは6文字以上です'),
});

type SendSchema = z.output<typeof sendSchema>;
type VerifySchema = z.output<typeof verifySchema>;

const state = reactive<Partial<VerifySchema>>({
  email: '',
  otp: '',
});

const step = ref<'send' | 'verify'>('send');
const loadingSend = ref(false);
const loadingVerify = ref(false);

const toast = useToast();
const router = useRouter();
const session = authClient.useSession();

async function onSend(event: FormSubmitEvent<SendSchema>) {
  if (loadingSend.value) return;
  loadingSend.value = true;
  try {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: event.data.email,
      type: 'sign-in',
    });
    if (error) {
      toast.add({
        title: 'エラー',
        description: `OTPの送信に失敗しました: ${error.message}`,
        color: 'error',
      });
    } else {
      // 次の画面に移行してメール欄をプリセット
      state.email = event.data.email;
      step.value = 'verify';
      toast.add({
        title: 'OTP送信済み',
        description: 'OTPを送信しました。受信したコードを入力してください。',
        color: 'success',
      });
    }
  } catch (e: unknown) {
    toast.add({
      title: 'エラー',
      description: e instanceof Error ? e.message : '予期しないエラーが発生しました',
      color: 'error',
    });
  } finally {
    loadingSend.value = false;
  }
}

async function onVerify(event: FormSubmitEvent<VerifySchema>) {
  if (loadingVerify.value) return;
  loadingVerify.value = true;
  try {
    // ← ここを verifyEmail から signIn.emailOtp に変更
    const { error } = await authClient.signIn.emailOtp({
      email: event.data.email,
      otp: event.data.otp,
    });
    if (error) {
      toast.add({
        title: '認証失敗',
        description: `メール認証に失敗しました: ${error.message}`,
        color: 'error',
      });
    } else {
      toast.add({
        title: '認証成功',
        description: 'メール認証が完了しました。',
        color: 'success',
      });
      // 認証後の遷移（必要なら変更）
      await router.push('/apps/dashboard');
    }
  } catch (e: unknown) {
    toast.add({
      title: 'エラー',
      description: e instanceof Error ? e.message : '予期しないエラーが発生しました',
      color: 'error',
    });
  } finally {
    loadingVerify.value = false;
  }
}

function backToSend() {
  step.value = 'send';
  state.otp = '';
}
</script>

<template>
  <div class="m-10 max-w-lg">
    <h1 class="text-5xl mb-6">ログイン</h1>

    <div v-if="session.data" class="mb-4">
      <p>ようこそ、{{ session.data.user.name ?? session.data.user.email }}さん</p>
    </div>

    <div v-if="step === 'send'">
      <UForm :schema="sendSchema" :state="state" @submit="onSend" class="space-y-4">
        <UFormField label="メールアドレス" name="email" required>
          <UInput v-model="state.email" />
        </UFormField>

        <UButton type="submit" :loading="loadingSend" :disabled="loadingSend">OTPを送信</UButton>
      </UForm>
    </div>

    <div v-else>
      <h2 class="text-2xl mb-4">OTPでサインイン</h2>
      <UForm :schema="verifySchema" :state="state" @submit="onVerify" class="space-y-4">
        <UFormField label="メールアドレス" name="email" required>
          <UInput v-model="state.email" />
        </UFormField>

        <UFormField label="OTPコード" name="otp" required>
          <UInput v-model="state.otp" />
        </UFormField>

        <div class="flex items-center gap-2">
          <UButton type="submit" :loading="loadingVerify" :disabled="loadingVerify">認証</UButton>
          <UButton type="button" color="secondary" @click="backToSend" :disabled="loadingVerify">戻る</UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>