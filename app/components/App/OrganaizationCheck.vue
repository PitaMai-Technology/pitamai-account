<script setup lang="ts">
import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';

const UNSELECTED_ORGANIZATION_ID = '__unselected_organization__';

const organizations = authClient.useListOrganizations();
const activeOrganization = useActiveOrg();

const toast = useToast();

const organizationItems = computed(() => [
  {
    name: '組織を選択しない',
    id: UNSELECTED_ORGANIZATION_ID,
  },
  ...(organizations.value.data ?? []),
]);

const selectedOrganizationId = computed(
  () => activeOrganization.value.data?.id ?? UNSELECTED_ORGANIZATION_ID
);

async function setActiveOrganization(id: string | null | undefined) {
  try {
    const organizationId =
      !id || id === UNSELECTED_ORGANIZATION_ID ? null : id;

    await authClient.organization.setActive({ organizationId });
    toast.add({
      title: organizationId ? '組織の切り替え完了' : '組織の選択を解除しました',
      description: organizationId
        ? '現在の組織を切り替えました。'
        : '現在の組織を未選択にしました。',
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
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-primary" />
    </div>
    <div v-else>
      <USelect :items="organizationItems" label-key="name" value-key="id" class="w-full"
        :model-value="selectedOrganizationId" @update:model-value="setActiveOrganization" placeholder="組織を選択してください" />
    </div>
    <template v-if="activeOrganization.data === null">
      <p class="text-sm text-info mt-2">
        現在、組織は選択されていません。</p>
      <template v-if="organizations.data?.length === 0">
        <p class="text-sm text-gray-500 mt-4">
          また、組織に所属していない場合は、既存の組織に招待される必要があります。詳細は管理者にお問い合わせください。
        </p>
      </template>
    </template>
  </div>
</template>
