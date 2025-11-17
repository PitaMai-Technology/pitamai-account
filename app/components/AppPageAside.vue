<script setup lang="ts">
const items = ref([
  {
    label: 'ダッシュボード',
    description: '組織のメイン画面',
    icon: 'i-lucide-house',
    to: '/apps/dashboard'
  },
  {
    label: '組織',
    icon: 'i-lucide-building', // 組織関連のアイコンを追加
    children: [
      {
        label: '組織作成',
        description: '新しい組織を作成する',
        icon: 'i-lucide-plus',
        to: '/apps/create-organization'
      },
      {
        label: 'アカウント追加',
        description: 'アカウントを追加する',
        icon: 'i-lucide-user-plus',
        to: '/apps/account-add'
      },
      {
        label: 'メンバー追加',
        description: '組織にメンバーを追加する',
        icon: 'i-lucide-users',
        to: '/apps/organization/member-add'
      },
      {
        label: 'メンバー管理',
        description: '組織のメンバーを管理する',
        icon: 'i-lucide-users',
        to: '/apps/organization/member'
      }
    ]
  }
])
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