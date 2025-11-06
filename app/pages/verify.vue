<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const verifying = ref(true);

onMounted(async () => {
  const token = route.query.token as string;

  if (!token) {
    toast.add({
      title: '認証エラー',
      description:
        '無効なリンクです。もう一度ログインリンクを送信してください。',
      color: 'error',
    });
    await router.push('/');
    return;
  }

  try {
    const { error } = await authClient.magicLink.verify({
      query: {
        token,
      },
    });

    if (error) {
      console.error('Verification error:', error);

      let errorMessage = 'リンクが無効または期限切れです';

      if (error.status === 400) {
        errorMessage =
          'リンクが無効です。もう一度ログインリンクを送信してください。';
      } else if (error.status === 401) {
        errorMessage =
          'リンクの有効期限が切れています。もう一度ログインリンクを送信してください。';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.add({
        title: '認証エラー',
        description: errorMessage,
        color: 'error',
      });

      await router.push('/');
      verifying.value = false;
      return;
    }

    toast.add({
      title: '認証成功',
      description: 'ログインしました',
      color: 'success',
    });

    // リダイレクトURLがある場合はそこへ、なければダッシュボードへ
    const callbackURL =
      (route.query.callbackURL as string) || '/apps/dashboard';
    await router.push(callbackURL);
  } catch (err) {
    console.error('Unexpected verification error:', err);

    const errorMessage =
      err instanceof Error ? err.message : 'リンクが無効または期限切れです';

    toast.add({
      title: '認証エラー',
      description: errorMessage,
      color: 'error',
    });

    await router.push('/');
    verifying.value = false;
  }
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <UPageCard class="w-full max-w-md">
      <div class="flex flex-col items-center justify-center space-y-4 py-8">
        <!-- 検証中 -->
        <div v-if="verifying" class="flex flex-col items-center space-y-4">
          <UIcon
            name="i-lucide-loader-circle"
            class="h-12 w-12 animate-spin text-primary"
          />
          <h2 class="text-xl font-semibold">認証中...</h2>
          <p class="text-center text-gray-600">リンクを確認しています...</p>
        </div>
      </div>
    </UPageCard>
  </div>
</template>
