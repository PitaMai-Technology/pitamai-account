<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { authClient } from '~/composable/auth-client'
import { useActiveOrg } from '~/composable/useActiveOrg'
import { useConfirmDialog } from '~/composable/useConfirmDialog'

definePageMeta({
  layout: 'the-app',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const organizationId = computed(() => route.params.id as string)
const wikiId = computed(() => route.params.wikiId as string)

const organizations = authClient.useListOrganizations()
const activeOrganization = useActiveOrg()

const title = ref('')
const content = ref('ここに入力。')

const {
  data: wikiData,
  pending: wikiPending,
  refresh: refreshWiki,
} = await useAsyncData(
  () => $fetch<{ wiki: { id: string; title: string; content: string } }>(`/api/wiki/${wikiId.value}`),
  {
    watch: [organizationId, wikiId],
  }
)

watch(
  () => wikiData.value,
  v => {
    if (!v?.wiki) return
    title.value = v.wiki.title
    content.value = v.wiki.content
  },
  { immediate: true }
)

const saving = ref(false)

const toolbarItems = [[
  { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: '戻る' } },
  { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: '進む' } },
], [
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: '太字' } },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: '斜体' } },
  { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: '下線' } },
  { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: '取り消し線' } },
  { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'コード' } },
], [
  { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', tooltip: { text: 'H1' } },
  { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'H2' } },
  { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: '箇条書き' } },
  { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: '番号付きリスト' } },
  { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: '引用' } },
  { kind: 'codeBlock', icon: 'i-lucide-square-code', tooltip: { text: 'コードブロック' } },
], [
  { slot: 'link' as const, icon: 'i-lucide-link', tooltip: { text: 'リンク' } },
]] satisfies EditorToolbarItem[][]

async function save() {
  if (!title.value.trim()) {
    toast.add({ title: 'タイトルを入力してください', color: 'error' })
    return
  }

  saving.value = true
  try {
    await $fetch(`/api/wiki/${wikiId.value}`, {
      method: 'PUT',
      body: {
        title: title.value,
        content: content.value,
        contentType: 'markdown',
      },
    })

    toast.add({ title: '保存しました', color: 'success' })
  } catch (e) {
    toast.add({ title: '保存に失敗しました', description: String(e), color: 'error' })
  } finally {
    saving.value = false
  }
}

const {
  open: confirmOpen,
  confirm: confirmDialog,
  resolve: resolveConfirm,
} = useConfirmDialog()

const deleting = ref(false)

async function remove() {
  const confirmed = await confirmDialog()
  if (!confirmed) return

  deleting.value = true
  try {
    await $fetch(`/api/wiki/${wikiId.value}`, { method: 'DELETE' })
    toast.add({ title: '削除しました', color: 'success' })
    await router.replace(`/apps/organization/wiki/${organizationId.value}`)
  } catch (e) {
    toast.add({ title: '削除に失敗しました', description: String(e), color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="organizations.isPending || activeOrganization.isPending || wikiPending"
      class="flex items-center justify-center py-12">
      <TheLoader />
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Wiki 編集</h1>
        <div class="flex gap-2">
          <UButton color="neutral" icon="i-lucide-arrow-left" variant="ghost"
            :to="`/apps/organization/wiki/${organizationId}`">戻る</UButton>
          <UButton color="primary" icon="i-lucide-save" :loading="saving" @click="save">保存</UButton>
        </div>
      </div>

      <UCard class="space-y-4">
        <UButton color="error" variant="solid" icon="i-lucide-trash" :loading="deleting" @click="remove">削除</UButton>
        <UFormField label="タイトル" class="mt-5">
          <UInput v-model="title" placeholder="例: はじめに" />
        </UFormField>

        <AppWikiEditor v-model="content" :toolbar-items="toolbarItems"
          toolbar-class="border-b border-muted sticky top-0 inset-x-0 sm:px-16 py-2 z-10 bg-default overflow-x-auto" />
      </UCard>

      <LazyTheConfirmModal :open="confirmOpen" title="確認" message="このWikiを削除しますか？" @confirm="() => resolveConfirm(true)"
        @cancel="() => resolveConfirm(false)" />
    </div>
  </div>
</template>
