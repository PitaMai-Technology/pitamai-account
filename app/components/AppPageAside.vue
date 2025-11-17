<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

// const activeOrganization = authClient.useActiveOrganization();

const items = ref([
  {
    label: 'ホーム',
    icon: 'i-lucide-home',
    to: '/apps/dashboard',
  },
  {
    label: '管理者ダッシュボード',
    icon: 'i-lucide-home',
    to: '/apps/admin',
    children: [
      {
        label: 'メンバー管理',
        icon: 'i-lucide-users',
        to: '/apps/admin/member',
      },
      {
        label: 'メンバー追加',
        icon: 'i-lucide-user-plus',
        to: '/apps/admin/member-add',
      },
      {
        label: 'アカウント追加',
        icon: 'i-lucide-user-plus',
        to: '/apps/admin/account-add',
      },
      {
        label: '組織作成',
        icon: 'i-lucide-plus-circle',
        to: '/apps/admin/create-organization',
      },
    ],
  },
]);

</script>

<template>
  <UPageAside class="aside">
    <div class="hidden xl:block mb-8">
      <UPopover>
        <UButton icon="i-lucide-chevron-down" size="md" color="neutral" variant="outline" class="w-full">組織を見る
        </UButton>

        <template #content>
          <div class="p-4 max-h-48 overflow-y-scroll">
            <LazyAppOrganaizationCheck class="" />
          </div>
        </template>
      </UPopover>
    </div>
    <UNavigationMenu :items="items" orientation="vertical" />
  </UPageAside>
</template>

<style scoped>
.aside {
  padding-left: 40px;
}
</style>