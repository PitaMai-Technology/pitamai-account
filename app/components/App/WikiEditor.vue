<script setup lang="ts">
import type { EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui'

const props = withDefaults(
  defineProps<{
    toolbarItems: EditorToolbarItem[][]
    placeholder?: string
    suggestionItems?: EditorSuggestionMenuItem[][]
  }>(),
  {
    placeholder: 'ここにWikiを書いてください...',
  }
)

const model = defineModel<string>({ required: true })

const defaultSuggestionItems: EditorSuggestionMenuItem[][] = [[
  { type: 'label', label: 'テキスト' },
  { kind: 'paragraph', label: '段落', icon: 'i-lucide-type' },
  { kind: 'heading', level: 1, label: '見出し1', icon: 'i-lucide-heading-1' },
  { kind: 'heading', level: 2, label: '見出し2', icon: 'i-lucide-heading-2' },
], [
  { type: 'label', label: 'リスト' },
  { kind: 'bulletList', label: '箇条書き', icon: 'i-lucide-list' },
  { kind: 'orderedList', label: '番号付きリスト', icon: 'i-lucide-list-ordered' },
], [
  { type: 'label', label: 'ブロック' },
  { kind: 'blockquote', label: '引用', icon: 'i-lucide-text-quote' },
  { kind: 'codeBlock', label: 'コードブロック', icon: 'i-lucide-square-code' },
  { kind: 'horizontalRule', label: '区切り線', icon: 'i-lucide-separator-horizontal' }
]]

const suggestionItems = computed(() => props.suggestionItems ?? defaultSuggestionItems)
</script>

<template>
  <UEditor v-slot="{ editor }" v-model="model" content-type="markdown" :placeholder="props.placeholder"
    :ui="{ base: 'py-6', content: 'min-h-100 cursor-text' }" class="w-full min-h-74">
    <!-- ツールバー: エディタの上部に配置 -->
    <UEditorToolbar :editor="editor" :items="props.toolbarItems"
      class="border-b border-muted py-2 px-8 sm:px-16 overflow-x-auto">
      <template #link>
        <AppEditorLinkPopover :editor="editor" />
      </template>
    </UEditorToolbar>

    <!-- ドラッグハンドル: ブロックの左側に表示 -->
    <UEditorDragHandle :editor="editor" />

    <!-- サジェストメニュー: / で起動 -->
    <UEditorSuggestionMenu :editor="editor" :items="suggestionItems" />
  </UEditor>
</template>
