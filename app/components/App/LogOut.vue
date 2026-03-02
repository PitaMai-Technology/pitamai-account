<script setup lang="ts">
import { authClient } from '~/composable/auth-client';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

defineProps<{
  iconOnly?: boolean;
}>();

const confirmStore = useConfirmDialogStore();
const loading = ref(false);
const toast = useToast();
const router = useRouter();

const onSignOut = async () => {
  loading.value = true;

  const confirmed = await confirmStore.confirm('本当にログアウトしますか？');
  if (!confirmed) {
    loading.value = false;
    return;
  }

  try {
    await authClient.signOut();
    toast.add({
      title: '成功',
      description: 'ログアウトしました。',
      color: 'success',
    });
    await router.push('/login');
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
  <UButton icon="i-lucide-log-out" :loading="loading" :square="iconOnly" @click="onSignOut">
    <span v-if="!iconOnly">ログアウト</span>
  </UButton>

  <TheConfirmModal />
</template>