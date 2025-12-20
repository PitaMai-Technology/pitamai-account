<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { z } from 'zod'

const props = defineProps<{
  editor: Editor
}>()

const open = ref(false)
const href = ref('')

const isActive = computed(() => props.editor.isActive('link'))

function syncFromSelection() {
  const current = props.editor.getAttributes('link')?.href
  href.value = typeof current === 'string' ? current : ''
}

watch(open, (v) => {
  if (v) syncFromSelection()
})

const toast = useToast()

const urlSchema = z.string().url()

function apply() {
  const url = href.value.trim()

  if (!url) {
    props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
    open.value = false
    return
  }

  try {
    urlSchema.parse(url)
  } catch (e) {
    toast.add({ title: '無効なURLです', description: '正しい形式のURLを入力してください（例: https://example.com）', color: 'error' })
    return
  }

  props.editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  open.value = false
}

function remove() {
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start' }">
    <UButton icon="i-lucide-link" color="neutral" variant="ghost" :active="isActive" @click="() => { open = true }" />

    <template #content>
      <div class="w-72 p-3 space-y-3">
        <UFormField label="URL">
          <UInput v-model="href" placeholder="https://..." inputmode="url" autocomplete="url"
            @keydown.enter.prevent="apply" />
        </UFormField>

        <div class="flex items-center justify-between gap-2">
          <UButton color="neutral" variant="soft" @click="apply">適用</UButton>
          <UButton v-if="isActive" color="error" variant="soft" @click="remove">解除</UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>
