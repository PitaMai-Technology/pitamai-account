<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { authClient } from '~/composable/auth-client';
import { useOrgRoleStore } from '~/stores/orgRole';

const session = authClient.useSession();
const { role } = storeToRefs(useOrgRoleStore());
</script>

<template>
  <UDashboardSidebar resizable :default-size="20" :min-size="15" :max-size="25">
    <template #header="{ collapsed }">
      <AppHeader :collapsed="collapsed" />
    </template>

    <template #default="{ collapsed }">
      <AppAsideNavgation :collapsed="collapsed" />
    </template>

    <template #footer="{ collapsed }">
      <div v-if="!collapsed" class="space-y-2">
        <div class="text-sm">
          <p class="text-gray-600 dark:text-gray-400 truncate">{{ session.data?.user.email }}</p>
          <p class="text-gray-600 dark:text-gray-400">
            役割: <strong>{{ role || '未所属' }}</strong>
          </p>
        </div>
        <AppLogOut class="w-full" />
      </div>
      <AppLogOut v-else icon-only class="w-full" />
    </template>
  </UDashboardSidebar>
</template>

<style scoped>
.aside {
  padding-left: 40px;
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.1);
}
</style>