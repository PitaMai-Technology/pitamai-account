<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useOrgRoleStore } from '~/stores/orgRole';

defineProps<{
  collapsed?: boolean;
}>();

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

const oauthClientItems = [
  [
    {
      label: 'OAuthクライアント管理',
      icon: 'i-lucide-key-round',
      to: '/apps/users/oauth-clients',
    },
  ],
];

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

const { canAccessAdmin, canAccessOAuthClients } = storeToRefs(useOrgRoleStore());
</script>

<template>
  <div>
    <div class="mb-6">
      <AppOrganaizationCheck />
    </div>
    <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" />

    <template v-if="canAccessOAuthClients">
      <USeparator class="my-4" label="OAuth" />
      <UNavigationMenu :collapsed="collapsed" :items="oauthClientItems" orientation="vertical" />
    </template>

    <template v-if="canAccessAdmin">
      <USeparator class="my-4" label="管理者のみ" />
      <UNavigationMenu :collapsed="collapsed" :items="adminItems" orientation="vertical" />
    </template>
  </div>
</template>
