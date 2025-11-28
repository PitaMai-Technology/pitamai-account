<script setup lang="ts">
import { authClient } from '~/composable/auth-client';
import { useOrgRole } from '~/composable/useOrgRoleChecks';

const session = authClient.useSession();
const { canAccessAdmin, isRoleResolved } = useOrgRole();

const toast = useToast();
const hasRedirected = ref(false);

if (import.meta.client) {
  watch(
    () => ({ canAccess: canAccessAdmin.value, resolved: isRoleResolved.value }),
    ({ canAccess, resolved }) => {
      if (!resolved) return; // ロール判定が完了するまで待機

      if (
        !canAccess &&
        window.location.pathname.startsWith('/apps/admin') &&
        !hasRedirected.value
      ) {
        hasRedirected.value = true;
        toast.add({
          title: '権限がないため、ダッシュボードに戻ります...',
          color: 'info',
        });
        setTimeout(() => {
          navigateTo('/apps/dashboard');
        }, 300);
      } else if (canAccess) {
        hasRedirected.value = false;
      }
    },
    { immediate: true }
  );
}
</script>

<template>
  <div class="relative">
    <AppHeader />
    <UPage class="m-auto min-h-screen bg-emerald-50">
      <template #left>
        <AppPageAside />
      </template>
      <div class="max-w-7xl m-auto">
        <UMain class="p-5 pt-10 max-w-6xl m-auto">
          <h1 class="text-2xl font-bold"
            >{{ session.data?.user.email }} さん。ようこそ！</h1
          >
          <USeparator type="solid" class="my-4" />
          <slot />
        </UMain>
      </div>
    </UPage>

    <!-- セッションが保留中の場合のオーバーレイローダー -->
    <div
      v-if="session.isPending"
      class="fixed inset-0 z-50 grid place-items-center bg-white/70"
      aria-busy="true"
      aria-live="polite"
    >
      <div class="text-center">
        <AppThinkingLoading />
        <h1 class="text-4xl mt-8 font-bold">読み込み中...</h1>
      </div>
    </div>
  </div>
</template>
