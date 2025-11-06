import { authClient } from '~/composable/auth-client';

export function useAuth() {
  const router = useRouter();
  const toast = useToast();
  const loading = ref(false);

  async function signOut() {
    loading.value = true;
    try {
      await authClient.signOut();
      toast.add({
        title: 'ログアウト',
        description: 'ログアウトしました',
        color: 'success',
      });
      await router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
      toast.add({
        title: 'エラー',
        description: 'ログアウトに失敗しました',
        color: 'error',
      });
    } finally {
      loading.value = false;
    }
  }

  return {
    signOut,
    loading,
  };
}
