<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

const loading = ref(false);
const toast = useToast();
const router = useRouter();

const onSignOut = async () => {
  loading.value = true;
  try {
    await authClient.signOut();
    toast.add({
      title: '成功',
      description: 'ログアウトしました。',
      color: 'success',
    });
    await router.push('/');
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
  <UHeader mode="slideover">
    <template #left>
      <div class="flex gap-4">
        <h1 class="text-2xl font-bold">MaiMai Hub</h1>
        <div class="hidden xl:block">
          <UPopover>
            <UButton icon="i-lucide-chevron-down" size="md" color="neutral" variant="outline">組織を見る
            </UButton>

            <template #content>
              <div class="p-4 max-h-48 overflow-y-scroll">
                <LazyAppOrganaizationCheck class="" />
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </template>
    <template #right>
      <div class="hidden xl:block">
        <UButton icon="i-lucide-log-out" :loading="loading" @click="onSignOut">
          ログアウト
        </UButton>
      </div>
    </template>

    <template #body>
      <UPopover class="">
        <UButton icon="i-lucide-chevron-down" size="md" color="neutral" variant="outline">組織を見る</UButton>

        <template #content>
          <div class="p-4 max-h-48 overflow-y-scroll">
            <AppOrganaizationCheck class="mt-6" />
          </div>
        </template>
      </UPopover>
    </template>
  </UHeader>
</template>
