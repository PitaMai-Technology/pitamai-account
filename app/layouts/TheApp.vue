<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { authClient } from '~/composable/auth-client';
import { useOrgRoleStore } from '~/stores/orgRole';

const session = authClient.useSession();
const { canAccessAdmin, isRoleResolved } = storeToRefs(useOrgRoleStore());
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
    <UDashboardGroup storage="local" storage-key="dashboard-layout">
      <AppPageAside />

      <UDashboardPanel id="standard" class="bg-emerald-50 dark:bg-gray-800">
        <template #header>
          <UDashboardNavbar class="lg:hidden" />
          <UDashboardToolbar class="hidden lg:flex bg-white dark:bg-gray-600 py-6">
            <template #left>
              <UButton icon="i-lucide-home" to="/apps/dashboard" variant="ghost" color="neutral">
                ダッシュボード
              </UButton>
              <UButton icon="i-lucide-mail" to="/apps/mail" variant="ghost" color="neutral">
                メール
              </UButton>
            </template>

            <template #right>
              <UButton icon="i-lucide-settings" to="/apps/users/settings" variant="ghost" color="neutral" square />
            </template>
          </UDashboardToolbar>
        </template>

        <template #body>
          <div class="dark:text-gray-100">
            <slot />
          </div>
        </template>
      </UDashboardPanel>
    </UDashboardGroup>

    <!-- セッションが保留中の場合のオーバーレイローダー -->
    <div v-if="session.isPending" class="fixed inset-0 z-50 grid place-items-center bg-white/70 dark:bg-gray-900/80"
      aria-busy="true" aria-live="polite">
      <div class="text-center">
        <AppThinkingLoading />
        <h1 class="text-4xl mt-8 font-bold dark:text-gray-100">読み込み中...</h1>
      </div>
    </div>
  </div>
</template>
