<script setup lang="ts">
import { authClient } from '~/composable/auth-client';
import { useOrgRole } from '~/composable/useOrgRoleChecks';

const session = authClient.useSession();
const { canAccessAdmin } = useOrgRole();

const toast = useToast();
const hasRedirected = ref(false);

if (import.meta.client) {
  watch(
    canAccessAdmin,
    value => {
      // 管理権限を失ったかつ管理ページにいる場合
      if (!value && window.location.pathname.startsWith('/apps/admin') && !hasRedirected.value) {
        hasRedirected.value = true;
        toast.add({
          title: '権限がないため、ダッシュボードに戻ります...',
          color: 'info',
        });
        // 少し待ってから遷移（トーストの表示を確実にするため）
        setTimeout(() => {
          navigateTo('/apps/dashboard');
        }, 300);
      }
    },
    { immediate: true }
  );
}
</script>

<template>
  <div>
    <template v-if="session.isPending">
      <div class="grid place-items-center min-h-screen">
        <div>
          <AppThinkingLoading />
          <h1 class="text-4xl mt-8 font-bold">読み込み中...</h1>
        </div>
      </div>
    </template>
    <template v-else>
      <AppHeader />
      <UPage class="m-auto min-h-screen bg-emerald-50">
        <template #left>
          <AppPageAside />
        </template>
        <div class="max-w-7xl m-auto">
          <UMain class="p-5 pt-10 max-w-6xl m-auto">
            <h1 class="text-2xl font-bold">{{ session.data?.user.email }} さん。ようこそ！</h1>
            <USeparator type="solid" class="my-4" />
            <slot />
          </UMain>
        </div>
      </UPage>
    </template>
  </div>
</template>
