<script setup lang="ts">
import { authClient } from '~/composable/auth-client'
import { useActiveOrg } from '~/composable/useActiveOrg'

definePageMeta({
  layout: 'the-app',
})

const route = useRoute()
const router = useRouter()

const organizationId = computed(() => route.params.id as string)
const wikiId = computed(() => route.params.wikiId as string)

const organizations = authClient.useListOrganizations()
const activeOrganization = useActiveOrg()

type WikiResponse = {
  wiki: {
    id: string
    title: string
    content: string
    contentType?: string
    updatedAt?: string
  }
}

const {
  data: wikiData,
  pending: wikiPending,
  error: wikiError,
} = await useFetch<WikiResponse>(() => `/api/wiki/${wikiId.value}`, {
  headers: useRequestHeaders(['cookie']),
  watch: [organizationId, wikiId],
})

const wiki = computed(() => wikiData.value?.wiki)

function goEdit() {
  router.push(`/apps/organization/wiki/${organizationId.value}/${wikiId.value}/edit`)
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="organizations.isPending || activeOrganization.isPending || wikiPending"
      class="flex items-center justify-center py-12">
      <TheLoader />
    </div>

    <div v-else-if="wikiError" class="py-6">
      <UAlert color="error" variant="soft" title="Wikiの取得に失敗しました" :description="String(wikiError)" />
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Wiki</h1>
          <p v-if="wiki?.updatedAt" class="text-xs text-muted">
            更新: {{ new Date(wiki.updatedAt).toLocaleString() }}
          </p>
        </div>
        <div class="flex gap-2">
          <UButton color="neutral" icon="i-lucide-arrow-left" variant="ghost"
            :to="`/apps/organization/wiki/${organizationId}`">戻る</UButton>
          <UButton color="primary" icon="i-lucide-pencil" @click="goEdit">編集</UButton>
        </div>
      </div>

      <UCard class="space-y-4">
        <div class="text-lg font-semibold">
          {{ wiki?.title || '（タイトルなし）' }}
        </div>

        <div v-if="wiki?.content" class="text-sm leading-7">
          <MDC :value="wiki.content" tag="div" />
        </div>
        <div v-else class="text-sm text-muted">本文がありません。</div>
      </UCard>
    </div>
  </div>
</template>
