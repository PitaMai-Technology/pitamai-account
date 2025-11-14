<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

const organizations = authClient.useListOrganizations();
const activeOrganization = authClient.useActiveOrganization();

const toast = useToast()

async function setActiveOrganization(id: string) {
  try {
    await authClient.organization.setActive({ organizationId: id });
    toast.add({
      title: '組織の切り替え完了',
      description: '現在の組織を切り替えました。',
      color: 'success'
    })
  } catch {
    toast.add({
      title: '組織の切り替え失敗',
      description: '現在の組織の切り替えに失敗しました。再度お試しください。',
      color: 'error'
    })
  }
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold">現在のあなたの組織</h2>
    <div class="mb-4">
      <UBadge v-if="activeOrganization.isPending">Loading...</UBadge>
      <UBadge v-else-if="activeOrganization.data === null">No active organization.</UBadge>
      <UBadge v-else>
        {{ activeOrganization.data.name }}
      </UBadge>
    </div>

    <h2>所属している組織一覧</h2>
    <div v-if="organizations.isPending">
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-primary" />
    </div>
    <div v-else-if="organizations.data === null">あなたが所属している組織はありません🥲</div>
    <ul v-else>
      <li v-for="organization in organizations.data" :key="organization.id">
        <UBadge :color="activeOrganization.data?.id === organization.id ? 'neutral' : undefined"
          :variant="activeOrganization.data?.id === organization.id ? 'outline' : undefined"
          :class="activeOrganization.data?.id !== organization.id ? 'cursor-pointer' : ''"
          @click="activeOrganization.data?.id !== organization.id && setActiveOrganization(organization.id)">
          {{ organization.name }}
        </UBadge>
        <span v-if="activeOrganization.data?.id == organization.id"> ←現在ここ！</span>
      </li>
    </ul>
  </div>
</template>