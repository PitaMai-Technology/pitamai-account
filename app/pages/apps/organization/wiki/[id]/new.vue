<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { authClient } from '~/composable/auth-client'
import { useActiveOrg } from '~/composable/useActiveOrg'

definePageMeta({
  layout: 'the-app',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const organizationId = computed(() => route.params.id as string)

const organizations = authClient.useListOrganizations()
const activeOrganization = useActiveOrg()

const title = ref('')
const content = ref('\n')

const saving = ref(false)

const toolbarItems = [[
  { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: 'Undo' } },
  { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: 'Redo' } },
], [
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
  { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: 'Underline' } },
  { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Strikethrough' } },
  { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Code' } },
], [
  { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', tooltip: { text: 'H1' } },
  { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'H2' } },
  { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
  { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Ordered list' } },
  { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: 'Quote' } },
  { kind: 'codeBlock', icon: 'i-lucide-square-code', tooltip: { text: 'Code block' } },
], [
  { slot: 'link' as const, icon: 'i-lucide-link', tooltip: { text: 'Link' } },
]] satisfies EditorToolbarItem[][]

async function save() {
  if (!title.value.trim()) {
    toast.add({ title: 'タイトルを入力してください', color: 'error' })
    return
  }

  saving.value = true
  try {
    const res = await $fetch<{ wiki: { id: string } }>('/api/wiki', {
      method: 'POST',
      body: {
        title: title.value,
        content: content.value,
        contentType: 'markdown',
      },
    })

    toast.add({ title: '作成しました', color: 'success' })
    await router.replace(`/apps/organization/wiki/${organizationId.value}/${res.wiki.id}`)
  } catch (e) {
    toast.add({ title: '作成に失敗しました', description: String(e), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="organizations.isPending || activeOrganization.isPending" class="flex items-center justify-center py-12">
      <TheLoader />
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Wiki 新規作成</h1>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" :to="`/apps/organization/wiki/${organizationId}`">戻る</UButton>
          <UButton color="primary" :loading="saving" @click="save">保存</UButton>
        </div>
      </div>

      <UCard class="space-y-4">
        <UFormField label="タイトル">
          <UInput v-model="title" placeholder="例: はじめに" />
        </UFormField>

        <AppWikiEditor v-model="content" :toolbar-items="toolbarItems" />
      </UCard>
    </div>
  </div>
</template>
