<script setup lang="ts">
/**
 * MailListPanel.vue
 * 
 * 役割:
 * スレッド化されたメール一覧を表示します。
 * 各メールアイテムはドラッグ可能、複数選択対応。
 * 返信スレッドは UCollapsible で折り畳み展開可能。
 * リフレッシュボタン、読み込み状態のスケルトン表示も実装。
 * 
 * Props:
 * - isLoading: メール一覧読み込み中フラグ（スケルトン表示用）
 * - mailList: 取得したメール全体（用途: 空状態判定）
 * - groupedMailList: スレッド化済みメール一覧（表示対象）
 * - selectedUid: 現在選択中のメール UID（ハイライト表示用）
 * - openingUid: 詳細表示中のメール UID（強調表示用）
 * - isUidMultiSelected: 指定 UID が複数選択状態か判定する関数
 * 
 * Emits:
 * - refresh: リフレッシュボタンクリック時
 * - open: メール詳細表示リクエスト（uid 指定）
 * - dragStart: メールドラッグ開始時 { uid, shiftKey }
 * - itemClick: メールアイテムクリック時 { uid, shiftKey }
 */
type MailListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  hasAttachment: boolean;
  seen: boolean;
};

type MailGroup = {
  key: string;
  sender: string;
  messages: MailListItem[];
};

const props = defineProps<{
  isLoading: boolean;
  mailList: MailListItem[];
  groupedMailList: MailGroup[];
  selectedUid: number | null;
  openingUid: number | null;
  isUidMultiSelected: (uid: number) => boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  open: [uid: number];
  dragStart: [payload: { uid: number; shiftKey: boolean }];
  itemClick: [payload: { uid: number; shiftKey: boolean }];
}>();
</script>

<template>
  <UCard class="lg:col-span-4">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">メール一覧</h2>
        <UButton size="xs" color="neutral" icon="i-lucide-refresh-cw" variant="outline" :disabled="isLoading"
          :loading="isLoading" @click="emit('refresh')">
        </UButton>
      </div>
    </template>

    <div v-if="isLoading" class="space-y-2">
      <USkeleton class="h-14 w-full bg-gray-100" />
      <USkeleton class="h-14 w-full bg-gray-100" />
      <USkeleton class="h-14 w-full bg-gray-100" />
    </div>

    <div v-else-if="mailList.length === 0" class="py-6 text-sm text-gray-500">
      メールがありません。
    </div>

    <div v-else class="space-y-2">
      <template v-for="group in groupedMailList" :key="group.key">
        <div class="space-y-1">
          <div class="flex justify-end">
            <UBadge v-if="group.messages.length > 1" color="info" variant="soft" size="sm">
              {{ group.messages.length }}件
            </UBadge>
          </div>
          <AppMailDraggableItem :message="group.messages[0]!" :selected-uid="selectedUid" :opening-uid="openingUid"
            :multi-selected="isUidMultiSelected(group.messages[0]!.uid)" @open="emit('open', $event)"
            @drag-start="emit('dragStart', $event)" @item-click="emit('itemClick', $event)" />
        </div>

        <UCollapsible v-if="group.messages.length > 1" class="pl-3">
          <UButton color="neutral" variant="ghost" size="xs" trailing-icon="i-lucide-chevron-down" class="mb-1"
            label="返信履歴を表示" />
          <template #content>
            <div class="space-y-1 border-l border-gray-200 pl-3">
              <AppMailDraggableItem v-for="message in group.messages.slice(1)" :key="message.uid" :message="message"
                :selected-uid="selectedUid" :opening-uid="openingUid" :multi-selected="isUidMultiSelected(message.uid)"
                @open="emit('open', $event)" @drag-start="emit('dragStart', $event)"
                @item-click="emit('itemClick', $event)" />
            </div>
          </template>
        </UCollapsible>
      </template>
    </div>
  </UCard>
</template>
