<script setup lang="ts">
import { authClient } from '~/composable/auth-client'
import { useActiveOrg } from '~/composable/useActiveOrg'
import { useWikiList } from '~/composable/useWikiList'

definePageMeta({
  layout: 'the-app',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const organizationId = computed(() => route.params.id as string)

const organizations = authClient.useListOrganizations()
const activeOrganization = useActiveOrg()

const activeOrganizationId = computed(() => activeOrganization.value.data?.id)
const isReady = computed(() => {
  return !organizations.value.isPending && !activeOrganization.value.isPending && !!activeOrganizationId.value
})

const currentOrganization = computed(() => {
  return organizations.value?.data?.find(org => org.id === organizationId.value) ?? null
})

const {
  data: wikiData,
  pending: wikiPending,
  error: wikiError,
} = useWikiList()

watch(
  () => wikiError.value,
  err => {
    if (err) {
      toast.add({ title: '読み込みに失敗しました', description: String(err), color: 'error' })
    }
  }
)

function goNew() {
  router.push(`/apps/organization/wiki/${organizationId.value}/new`)
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="organizations.isPending || activeOrganization.isPending" class="flex items-center justify-center py-12">
      <TheLoader />
    </div>

    <div v-else-if="currentOrganization" class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Wiki</h1>
          <p class="text-sm text-muted">{{ currentOrganization.name }}</p>
        </div>

        <UButton color="primary" @click="goNew">新規作成</UButton>
      </div>

      <UCard>
        <div v-if="wikiPending" class="py-10 flex items-center justify-center">
          <USkeleton class="bg-gray-100 h-64 w-full" />
        </div>

        <div v-else-if="(wikiData?.wikis?.length || 0) === 0" class="text-sm text-muted py-6">
          まだWikiページがありません。
        </div>

        <div v-else class="divide-y divide-muted">
          <NuxtLink v-for="w in wikiData?.wikis" :key="w.id" :to="`/apps/organization/wiki/${organizationId}/${w.id}`"
            class="block py-3 hover:bg-muted/30 rounded-md px-2">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <div class="font-medium truncate">{{ w.title }}</div>
              </div>
              <div class="text-xs text-muted whitespace-nowrap">
                {{ new Date(w.updatedAt).toLocaleString() }}
              </div>
            </div>
          </NuxtLink>
        </div>
      </UCard>
    </div>
  </div>
</template>
