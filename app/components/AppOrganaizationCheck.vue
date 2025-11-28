<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

const organizations = authClient.useListOrganizations();
const activeOrganization = authClient.useActiveOrganization();

const toast = useToast();

async function setActiveOrganization(id: string) {
  try {
    await authClient.organization.setActive({ organizationId: id });
    toast.add({
      title: '組織の切り替え完了',
      description: '現在の組織を切り替えました。',
      color: 'success',
    });
  } catch {
    toast.add({
      title: '組織の切り替え失敗',
      description: '現在の組織の切り替えに失敗しました。再度お試しください。',
      color: 'error',
    });
  }
}
</script>

<template>
  <div>
    <!-- <h2 class="text-lg font-semibold">現在のあなたの組織</h2>
    <div class="mb-4">
      <TheLoader v-if="activeOrganization.isPending" />
      <UBadge v-else-if="activeOrganization.data === null" class="w-full" color="neutral" variant="subtle">
        下のリストから選択してください。</UBadge>
      <UBadge v-else class="w-full rounded-none">
        {{ activeOrganization.data.name }}
      </UBadge>
    </div> -->

    <h2>所属している組織一覧</h2>
    <div v-if="organizations.isPending">
      <UIcon
        name="i-lucide-loader-circle"
        class="h-8 w-8 animate-spin text-primary"
      />
    </div>
    <div v-else-if="organizations.data === null"
      >あなたが所属している組織はありません🥲</div
    >
    <div v-else>
      <USelect
        :items="[...(organizations.data || [])]"
        label-key="name"
        value-key="id"
        class="w-full"
        :model-value="activeOrganization.data?.id"
        @update:model-value="setActiveOrganization"
      />
    </div>
    <p v-if="activeOrganization.data === null" class="text-sm text-info mt-2">
      現在、組織は選択されていません。 上のリストから組織を選択してください。
    </p>
  </div>
</template>
