<script setup lang="ts">
import type { EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui'

type EditorUi = {
  base?: string
  content?: string
}

const defaultEditorUi: EditorUi = {
  // 本文エリアの余白はここで統一
  base: 'py-6',
  content: 'min-h-50 p-4 cursor-text',
}

const props = withDefaults(
  defineProps<{
    toolbarItems: EditorToolbarItem[][]
    placeholder?: string
    ui?: EditorUi
    editorClass?: string
    toolbarClass?: string
    showDragHandle?: boolean
    showSuggestionMenu?: boolean
    suggestionItems?: EditorSuggestionMenuItem[][]
  }>(),
  {
    placeholder: 'ここにWikiを書いてください...',
    editorClass: 'w-full min-h-74',
    toolbarClass: 'border-b border-muted py-2 overflow-x-auto',
    showDragHandle: true,
    showSuggestionMenu: true,
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

const editorUi = computed<EditorUi>(() => props.ui ?? defaultEditorUi)

// overflowでメニューが見切れるのを避けるため、必要に応じて body にメニューを移す
const appendToBody = import.meta.client ? () => document.body : undefined
</script>

<template>
  <UEditor v-slot="{ editor }" v-model="model" content-type="html" :placeholder="props.placeholder" :ui="editorUi"
    :class="props.editorClass">
    <UEditorToolbar :editor="editor" :items="props.toolbarItems" :class="props.toolbarClass">
      <template #link>
        <AppEditorLinkPopover :editor="editor" />
      </template>
    </UEditorToolbar>
    <UEditorDragHandle v-show="props.showDragHandle" :editor="editor" />
    <UEditorSuggestionMenu v-show="props.showSuggestionMenu" :editor="editor" :items="suggestionItems"
      :append-to="appendToBody" />
  </UEditor>
</template>
