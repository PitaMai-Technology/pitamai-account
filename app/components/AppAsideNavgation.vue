<script setup lang="ts">
import { useOrgRole } from '~/composable/useOrgRoleChecks';

const tabs = [
  {
    label: '設定',
    icon: 'i-lucide-user',
    slot: 'settings',
  },
  {
    label: 'アプリ',
    icon: 'i-lucide-app-window',
    slot: 'apps',
  },
];

const items = ref([
  {
    label: 'ホーム',
    icon: 'i-lucide-home',
    to: '/apps/dashboard',
  },
]);

const adminItems = [
  [
    {
      label: '組織ダッシュボード',
      icon: 'i-lucide-crown',
      children: [
        {
          label: '組織作成',
          icon: 'i-lucide-plus-circle',
          to: '/apps/admin/create-organization',
        },
        {
          label: '組織情報更新',
          icon: 'i-lucide-edit',
          to: '/apps/admin/organization-update',
        },
        {
          label: '組織削除',
          icon: 'i-lucide-trash',
          to: '/apps/admin/organization-delete',
        },
      ],
    },
    {
      label: 'アカウント管理',
      icon: 'i-lucide-user-round-cog',
      children: [
        {
          label: 'メンバー管理',
          icon: 'i-lucide-users',
          to: '/apps/admin/member',
        },
        {
          label: 'メンバー招待',
          icon: 'i-lucide-mail-plus',
          to: '/apps/admin/member-add',
        },
        {
          label: 'アカウント追加',
          icon: 'i-lucide-user-plus',
          to: '/apps/admin/account-add',
        },
      ],
    },
  ],
];
const { canAccessAdmin } = useOrgRole();

// dev only
</script>

<template>
  <div>
    <div class="hidden xl:block mb-8">
      <AppLogOut class="mb-8" />
      <!-- <UButton @click="onFetchNavigation">
        ナビゲーションを更新
      </UButton> -->
      <div class="my-4">
        <AppOrganaizationCheck />
      </div>
    </div>
    <UTabs :items="tabs" class="gap-5" variant="link" color="info">
      <template #settings>
        <UNavigationMenu :items="items" orientation="vertical" />

        <template v-if="canAccessAdmin">
          <USeparator class="my-4" label="管理者のみ" />
          <UNavigationMenu :items="adminItems" orientation="vertical" />
        </template>
      </template>

      <template #apps>
        <h1>App test</h1>
      </template>
    </UTabs>
  </div>
</template>
