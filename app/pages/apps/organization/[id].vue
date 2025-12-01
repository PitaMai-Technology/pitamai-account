<script setup lang="ts">
import { authClient } from '~/composable/auth-client';
import { useOrg } from '~/composable/useOrg';
import { useActiveOrg } from '~/composable/useActiveOrg';

definePageMeta({
  layout: 'the-app',
});

const route = useRoute();
const organizationId = computed(() => route.params.id as string);

const organizations = authClient.useListOrganizations();
const activeOrganization = useActiveOrg();
const { switchOrganization } = useOrg();

// 組織の切り替えと検証
const isValidating = ref(true);

onMounted(async () => {
  const success = await switchOrganization(organizationId.value);

  if (success) {
    isValidating.value = false;
  }
  // switchOrganization内でリダイレクト処理が行われるため、ここでは不要
});

// 現在の組織を取得
const currentOrganization = computed(() => {
  if (!organizations.value) return null;
  return organizations.value.data?.find(org => org.id === organizationId.value);
});
</script>

<template>
  <div>
    <div v-if="
      isValidating || organizations.isPending || activeOrganization.isPending
    " class="flex items-center justify-center py-12">
      <TheLoader />
    </div>
    <div v-else-if="currentOrganization" class="space-y-4">
      <div class="rounded-lg bg-white p-6 shadow">
        <h1 class="text-2xl font-bold">{{ currentOrganization.name }}</h1>
        <p class="text-sm text-gray-600">組織ID: {{ currentOrganization.id }}</p>
      </div>
      <!-- ここに組織固有のコンテンツを追加 -->
    </div>
  </div>
</template>
