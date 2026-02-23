<script setup lang="ts">
/**
 * MailDetailPanel.vue
 * 
 * 役割:
 * メール詳細表示パネル。選択中のメール件名・送信者・Cc・本文・添付ファイルを表示し、
 * 既読/未読切り替え、アーカイブ、削除、下書き復元（下書きフォルダ時）、
 * 復元（ゴミ箱フォルダ時）などの操作ボタンを提供します。
 * 
 * Props:
 * - selectedMessage: 一覧で現在選択中のメール（件名・UID）
 * - currentMail: 詳細表示中のメール全文（HTML/テキスト・添付ファイル）
 * - messageMetaLabel: メタ情報ラベル（'差出人(From)' または '宛先(To)'）
 * - messageMetaValue: メタ情報値（送信者アドレスまたは宛先）
 * - isSentFolder: 送信済みフォルダかどうかの真偽値
 * - messageCcValue: Cc ヘッダー値（送信済みフォルダ時のみ表示）
 * - hasSelectedMail: メールが選択されているかの真偽値（操作ボタン disable 制御用）
 * - selectedSeen: 現在メール既読状態（ボタン「既読/未読」テキスト切り替え用）
 * - isDraftFolder: 下書きフォルダかどうか（ボタン条件表示用）
 * - isTrashFolder: ゴミ箱フォルダかどうか（ボタン条件表示用）
 * 
 * Emits:
 * - toggleSeen: 既読/未読切り替えボタン
 * - move: 削除/アーカイブ/復元ボタン（destination='trash'|'archive'|'inbox'）
 * - useDraftCompose: 下書きから送信ボタン
 */
type MailListItem = {
  uid: number;
  subject: string | null;
};

type MailDetail = {
  subject: string | null;
  html: string | null;
  text: string | null;
  attachments: Array<{
    filename: string | null;
    contentType: string;
    size: number;
  }>;
};

const props = defineProps<{
  selectedMessage: MailListItem | null;
  currentMail: MailDetail | null;
  messageMetaLabel: string;
  messageMetaValue: string;
  isSentFolder: boolean;
  messageCcValue: string | null;
  hasSelectedMail: boolean;
  selectedSeen: boolean | null;
  isDraftFolder: boolean;
  isTrashFolder: boolean;
  isSpamFolder: boolean;
}>();

const emit = defineEmits<{
  toggleSeen: [];
  move: [destination: 'trash' | 'archive' | 'inbox'];
  useDraftCompose: [];
  openAttachment: [index: number];
}>();
</script>

<template>
  <UCard class="lg:col-span-6">
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="truncate text-sm font-semibold">
            {{ selectedMessage?.subject || currentMail?.subject || '(件名なし)' }}
          </h2>
          <p class="text-xs text-gray-600">{{ messageMetaLabel }}: {{ messageMetaValue }}</p>
          <p v-if="isSentFolder" class="text-xs text-gray-600">Cc: {{ messageCcValue }}</p>
        </div>
        <div class="flex gap-2">
          <UButton size="xs" color="neutral" variant="outline" :disabled="!hasSelectedMail" @click="emit('toggleSeen')">
            {{ selectedSeen ? '未読にする' : '既読にする' }}
          </UButton>
          <UButton size="xs" color="neutral" variant="outline" :disabled="!hasSelectedMail"
            @click="emit('move', 'archive')">
            アーカイブ
          </UButton>
          <UButton size="xs" color="error" variant="outline" :disabled="!hasSelectedMail"
            @click="emit('move', 'trash')">
            削除
          </UButton>
          <UButton v-if="isDraftFolder" size="xs" color="primary" variant="outline" :disabled="!hasSelectedMail"
            @click="emit('useDraftCompose')">
            下書きから送信
          </UButton>
          <UButton v-if="isTrashFolder" size="xs" color="success" variant="outline" :disabled="!hasSelectedMail"
            @click="emit('move', 'inbox')">
            戻す
          </UButton>
        </div>
      </div>
    </template>

    <div v-if="currentMail?.attachments?.length" class="mb-4 space-y-1 rounded border border-gray-200 p-3">
      <p class="text-xs font-medium text-gray-700">添付ファイル</p>
      <div v-for="(attachment, index) in currentMail.attachments" :key="`${attachment.filename}-${attachment.size}`"
        class="flex items-center justify-between gap-3 text-xs text-gray-600">
        <p>
          {{ attachment.filename || 'unnamed' }} ({{ attachment.size }} bytes)
        </p>
        <UButton size="xs" color="neutral" variant="outline" :disabled="isSpamFolder"
          @click="emit('openAttachment', index)">
          開く
        </UButton>
      </div>
      <p v-if="isSpamFolder" class="text-xs text-amber-700">
        迷惑メールでは添付ファイルを開けません。
      </p>
    </div>

    <AppMailBody :html="currentMail?.html" :text="currentMail?.text" :block-media="isSpamFolder" />
  </UCard>
</template>
