<script setup lang="ts">
import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';
import { useOrgRole } from '~/composable/useOrgRoleChecks';
import { useWikiTreeNavigation } from '~/composable/useWikiTreeNavigation';

defineProps<{
  collapsed?: boolean;
}>();

const tabs = [
  {
    label: 'アプリ',
    icon: 'i-lucide-app-window',
    slot: 'apps',
  },
  {
    label: '設定',
    icon: 'i-lucide-user',
    slot: 'settings',
  }
];

const items = ref([
  {
    label: 'ホーム',
    icon: 'i-lucide-home',
    to: '/apps/dashboard',
  },
  {
    label: '設定',
    icon: 'i-lucide-user',
    to: '/apps/users/settings',
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
          to: '/apps/admin/organization/create-organization',
        },
        {
          label: '組織情報更新',
          icon: 'i-lucide-edit',
          to: '/apps/admin/organization/organization-update',
        },
        {
          label: '組織削除',
          icon: 'i-lucide-trash',
          to: '/apps/admin/organization/organization-delete',
        },
        {
          label: 'メンバー管理',
          icon: 'i-lucide-users',
          to: '/apps/admin/organization/member',
        },
        {
          label: 'メンバー招待',
          icon: 'i-lucide-mail-plus',
          to: '/apps/admin/organization/member-add',
        },
        {
          label: '監査ログ',
          icon: 'i-lucide-file-search',
          to: '/apps/admin/audit',
        },
      ],
    },
    {
      label: '全体のアカウント管理',
      icon: 'i-lucide-user-round-cog',
      children: [
        {
          label: 'アカウント一覧',
          icon: 'i-lucide-list',
          to: '/apps/admin/account',
        },
        {
          label: 'アカウント追加',
          icon: 'i-lucide-user-plus',
          to: '/apps/admin/account-add',
        },
        {
          label: 'アカウントの情報更新',
          icon: 'i-lucide-edit-2',
          to: '/apps/admin/user-update',
        },
        {
          label: 'アカウントのメール変更',
          icon: 'i-lucide-mail',
          to: '/apps/admin/user-change-email',
        },
      ],
    },
  ],
];
const { role, canAccessAdmin } = useOrgRole();

const activeOrg = useActiveOrg();

const {
  wikiTreeItems,
  wikiTreePending,
  activeOrganizationId,
  wikiTreeValue,
  getWikiTreeKey,
  onWikiTreeSelect,
} = useWikiTreeNavigation();

const session = authClient.useSession();
</script>

<template>
  <div>
    <div class="mb-6">
      <AppOrganaizationCheck />
    </div>

    <UTabs :items="tabs" class="gap-5" variant="link" color="info">
      <template #apps>

        <template v-if="!activeOrganizationId">
          <p class="text-sm text-muted">
            組織を選択してください。
          </p>
        </template>
        <template v-else-if="wikiTreePending">
          <USkeleton class="bg-gray-100 h-48 w-full" />
        </template>

        <template v-else>
          <UTree v-model="wikiTreeValue" size="md" :items="wikiTreeItems" :get-key="getWikiTreeKey"
            :on-select="onWikiTreeSelect" />
        </template>

      </template>

      <template #settings>
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" />

        <template v-if="canAccessAdmin">
          <USeparator class="my-4" label="管理者のみ" />
          <UNavigationMenu :collapsed="collapsed" :items="adminItems" orientation="vertical" />
        </template>
      </template>
    </UTabs>
  </div>
</template>
