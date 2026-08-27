<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';

const navigationItems = [
  {
    label: 'プライバシ・ポリシー',
    to: '/kiyaku/privacy-policy',
  },
  {
    label: '運営規約',
    to: '/kiyaku/unei',
  },
  {
    label: 'PitaMaiアカウント利用規約',
    to: '/kiyaku/pitamai-account',
  },
] satisfies NavigationMenuItem[];

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
  <UHeader>
    <template #left>
      <NuxtLink to="/" class="flex items-center gap-2">
        <img src="/pitamai-only-logo.png" alt="PitaMai Logo" class="h-10 w-auto" />
      </NuxtLink>
    </template>

    <UNavigationMenu :items="navigationItems" />

    <template #right>
      <template v-if="session.data">
        <UButton to="/apps/dashboard" target="_blank">ダッシュボード</UButton>
        <UButton icon="i-lucide-log-out" @click="onSignOut" color="error" size="xs">
          ログアウト
        </UButton>
      </template>
      <template v-else-if="session.isPending">
        <TheLoader />
      </template>
      <template v-else>
        <UButton icon="i-lucide-log-in" to="/login" color="primary">ログイン</UButton>
        <UButton icon="i-lucide-user-plus" to="/register" color="primary" variant="outline">構成員申請</UButton>
      </template>
    </template>

    <template #body>
      <UNavigationMenu :items="navigationItems" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>
</template>
