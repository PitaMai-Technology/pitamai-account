<script setup lang="ts">
import { useOrgRole } from '~/composable/useOrgRoleChecks';

const tabs = [
  {
    label: '設定',
    icon: 'i-lucide-user',
    slot: 'settings'
  },
  {
    label: 'アプリ',
    icon: 'i-lucide-app-window',
    slot: 'apps'
  }
]

const items = ref([
  {
    label: 'ホーム',
    icon: 'i-lucide-home',
    to: '/apps/dashboard',
  },
]);

const adminItems = [[
  {
    label: '管理者ダッシュボード',
    icon: 'i-lucide-crown',
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
]];
const { canAccessAdmin } = useOrgRole();

</script>

<template>
  <div>
    <div class="hidden xl:block mb-8">
      <AppLogOut class="mb-8" />
      <!-- <UButton @click="onFetchNavigation">
        ナビゲーションを更新
      </UButton> -->
      <UPopover>
        <UButton icon="i-lucide-chevron-down" size="md" color="neutral" variant="outline" class="w-full">組織を見る
        </UButton>

        <template #content>
          <div class="p-4 max-h-48 max-w-64 overflow-y-scroll">
            <LazyAppOrganaizationCheck class="" />
          </div>
        </template>
      </UPopover>
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
        <h1>あ</h1>
      </template>
    </UTabs>
  </div>
</template>