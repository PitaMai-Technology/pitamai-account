<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

const toast = useToast();
const loading = ref(false);

const session = authClient.useSession();

const onSignOut = async () => {
  loading.value = true;
  try {
    await authClient.signOut();
    toast.add({
      title: '成功',
      description: 'ログアウトしました。',
      color: 'success',
    });
  } catch (err) {
    console.error('Sign out error:', err);
    const errorMessage =
      err instanceof Error
        ? err.message
        : 'エラーが発生しました。もう一度お試しください。';
    toast.add({
      title: 'エラー',
      description: errorMessage,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <UHeader title="MaiMai Hub">
    <template #right>
      <template v-if="session.data">
        <UButton to="/apps/dashboard" target="_blank">ダッシュボード</UButton>
        <UButton
          icon="i-lucide-log-out"
          @click="onSignOut"
          color="error"
          size="xs"
        >
          ログアウト
        </UButton>
      </template>
      <template v-else-if="session.isPending">
        <TheLoader />
      </template>
    </template>
  </UHeader>
</template>
