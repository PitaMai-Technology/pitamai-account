<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMailApi } from '~/composable/useMailApi';
import { useMailAccountConnectivity } from '~/composable/useMailAccountConnectivity';
import { useMailActions } from '~/composable/useMailActions';
import { useMailCompose } from '~/composable/useMailCompose';
import { useMailFolderRouteSync } from '~/composable/useMailFolderRouteSync';
import { useMailFolders } from '~/composable/useMailFolders';
import { useMailMessages } from '~/composable/useMailMessages';
import { useMailReplyCompose } from '~/composable/useMailReplyCompose';
import { useMailRealtime } from '~/composable/useMailRealtime';
import { useMailSearch } from '~/composable/useMailSearch';
import { useMailSelection } from '~/composable/useMailSelection';
import { useRecipientTypeSwitch } from '~/composable/useRecipientTypeSwitch';
import { useMailStore } from '~/stores/mail';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({
  layout: 'the-app',
});

const mailStore = useMailStore();
const mailApi = useMailApi();
const confirmStore = useConfirmDialogStore();

const {
  activeFolderPath,
  folders,
  mailList,
  currentMail,
  selectedUid,
  isLoading,
  composeOpen,
  sending,
  draftSaving,
  creatingFolder,
  folderActionLoading,
  newFolderName,
  openingUid,
  multiSelectedUids,
  shiftDragBulkEnabled,
  shiftDragSelectedUids,
  recipientType,
} = storeToRefs(mailStore);

const composeState = mailStore.composeState;

const hasMailSetting = computed(() => accounts.value.length > 0);
const realtimeFolderPath = 'INBOX';

const {
  accounts,
  selectedAccount,
  imapReachable,
  smtpReachable,
  showMailSettingAlert,
  mailSettingAlertDescription,
  loadAccounts,
  checkMailConnectivity,
  startConnectivityPolling,
  stopConnectivityPolling,
} = useMailAccountConnectivity({
  hasMailSetting,
});

const {
  folderOptions,
  isTrashFolder,
  isSentFolder,
  isDraftFolder,
  isSpamFolder,
  loadFolders,
} = useMailFolders({
  hasMailSetting,
  activeFolderPath,
  folders,
  isLoading,
  creatingFolder,
  folderActionLoading,
  newFolderName,
  setFolders: mailStore.setFolders,
  setActiveFolder: mailStore.setActiveFolder,
});

const selectedMessage = computed(() => {
  if (selectedUid.value === null) return null;
  return mailList.value.find(item => item.uid === selectedUid.value) ?? null;
});

const messageMetaLabel = computed(() =>
  isSentFolder.value ? '宛先(To)' : '差出人(From)'
);

const messageMetaValue = computed(() => {
  const isCurrentMailSelected =
    currentMail.value?.uid !== undefined &&
    selectedUid.value !== null &&
    currentMail.value.uid === selectedUid.value;

  if (isSentFolder.value) {
    if (!isCurrentMailSelected) return '-';
    return currentMail.value?.to || '-';
  }

  if (isCurrentMailSelected) {
    return currentMail.value?.from || selectedMessage.value?.from || '-';
  }

  return selectedMessage.value?.from || '-';
});

const messageCcValue = computed(() => {
  if (!isSentFolder.value) return null;
  if (currentMail.value?.uid !== selectedUid.value) return '-';
  return currentMail.value?.cc || '-';
});

// メール一覧と詳細表示ロジック
const {
  groupedMailList,
  selectedSeen,
  hasSelectedMail,
  maybeNotifyNewMail,
  loadMessages,
  openMessage,
  onToggleSeen,
} = useMailMessages({
  hasMailSetting,
  activeFolderPath,
  mailList,
  currentMail,
  selectedUid,
  openingUid,
  isLoading,
  setMailList: mailStore.setMailList,
  setCurrentMail: mailStore.setCurrentMail,
  selectUid: mailStore.selectUid,
  getCachedMailList: mailStore.getCachedMailList,
  setCachedMailList: mailStore.setCachedMailList,
  getCachedMailDetail: mailStore.getCachedMailDetail,
  setCachedMailDetail: mailStore.setCachedMailDetail,
});

const { searchQuery, filteredMailList, filteredGroupedMailList } = useMailSearch({
  mailList,
  groupedMailList,
});

// メール選択ロジック
const {
  recipientTypeOptions,
  addCcField,
  removeCcField,
  addBccField,
  removeBccField,
  onUseDraftForCompose,
  onSendMail,
  onSaveDraft,
} = useMailCompose({
  composeState,
  recipientType,
  composeOpen,
  sending,
  draftSaving,
  currentMail,
  resetComposeState: mailStore.resetComposeState,
});

// メール選択とドラッグ&ドロップロジック
const {
  onMailDragStart,
  isUidMultiSelected,
  onMailItemClick,
  resolveDropTargetUids,
  resetSelectionAfterDrop,
} = useMailSelection({
  multiSelectedUids,
  shiftDragBulkEnabled,
  shiftDragSelectedUids,
});

// リアルタイム受信ロジック
const { streamConnected, startRealtimeStream, stopRealtimeStream } = useMailRealtime({
  hasMailSetting,
  realtimeFolderPath,
  createStreamUrl: mailApi.createStreamUrl,
  onNewMail: async () => {
    maybeNotifyNewMail();
    await loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: true,
      forceSync: true,
    });
  },
});

const { handleRecipientTypeChange } = useRecipientTypeSwitch({
  recipientType,
  hasRecipientData: mailStore.hasRecipientData,
  clearRecipientField: mailStore.clearRecipientField,
  confirm: confirmStore.confirm,
});

const { onReplyCompose } = useMailReplyCompose({
  currentMail,
  selectedUid,
  composeState,
  composeOpen,
  resetComposeState: mailStore.resetComposeState,
});

const { applyFolderFromQuery } = useMailFolderRouteSync({
  hasMailSetting,
  folders,
  activeFolderPath,
  setActiveFolder: mailStore.setActiveFolder,
  loadMessages: async options => {
    searchQuery.value = '';
    await loadMessages(options);
  },
});

const { onDropMailToFolder, onMove, onOpenAttachment } = useMailActions({
  activeFolderPath,
  selectedUid,
  currentMail,
  hasSelectedMail,
  isSpamFolder,
  resolveDropTargetUids,
  resetSelectionAfterDrop,
  clearMailDataCache: mailStore.clearMailDataCache,
  confirm: confirmStore.confirm,
  loadMessages,
});

watch(hasMailSetting, async enabled => {
  if (!enabled) {
    stopRealtimeStream();
    imapReachable.value = null;
    smtpReachable.value = null;
    return;
  }

  await checkMailConnectivity();
  await loadFolders();
  const folderSwitchedFromQuery = applyFolderFromQuery();
  if (!folderSwitchedFromQuery) {
    await loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: false,
      forceSync: false,
    });
  }
  startRealtimeStream();
}, { immediate: true });

onMounted(async () => {
  await loadAccounts();
  startConnectivityPolling();
});

onBeforeUnmount(() => {
  stopRealtimeStream();
  stopConnectivityPolling();
});
</script>

<template>
  <div class="space-y-4">
    <UPageCard>
      <UInput v-model="searchQuery" class="w-full max-w-md mb-4" icon="i-lucide-search" placeholder="件名・差出人で検索" />
      <div class="flex flex-wrap items-center gap-3">
        <USelect v-model="activeFolderPath" class="w-56" :items="folderOptions" placeholder="フォルダを選択" />
        <UButton color="primary" icon="i-lucide-pencil" @click="composeOpen = true">メール新規作成</UButton>
      </div>
    </UPageCard>

    <UAlert v-if="showMailSettingAlert" color="warning" variant="soft" title="メールサーバーの設定がうまくいっていません"
      :description="mailSettingAlertDescription" :actions="[{ label: '設定を開く', to: '/apps/users/settings' }]" />

    <div class="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-12">

      <AppMailListPanel :is-loading="isLoading" :mail-list="filteredMailList"
        :grouped-mail-list="filteredGroupedMailList" :selected-uid="selectedUid" :opening-uid="openingUid"
        :is-uid-multi-selected="isUidMultiSelected" :selected-uids="multiSelectedUids"
        @refresh="loadMessages({ markOpenedAsRead: false, notifyIfNew: false, forceSync: true })"
        @open="uid => openMessage(uid, true)" @drag-start="onMailDragStart" @item-click="onMailItemClick" />

      <AppSticky v-slot="{ stickyClass, stickyStyle }">
        <AppMailDetailPanel class="h-[80vh] overflow-y-scroll" :selected-message="selectedMessage"
          :current-mail="currentMail" :class="stickyClass" :style="stickyStyle" :message-meta-label="messageMetaLabel"
          :message-meta-value="messageMetaValue" :is-sent-folder="isSentFolder" :message-cc-value="messageCcValue"
          :has-selected-mail="hasSelectedMail" :opening-uid="openingUid" :selected-seen="selectedSeen"
          :is-draft-folder="isDraftFolder" :is-trash-folder="isTrashFolder" :is-spam-folder="isSpamFolder"
          @toggle-seen="onToggleSeen" @move="onMove" @use-draft-compose="onUseDraftForCompose"
          @open-attachment="onOpenAttachment" @reply="onReplyCompose" />
      </AppSticky>
    </div>

    <div v-if="selectedAccount === null" class="text-sm text-gray-500">
      利用可能なメールアカウントがありません。先に `MailAccount` を作成してください。
    </div>

    <AppMailComposeModal :compose-open="composeOpen" :recipient-type="recipientType"
      :recipient-type-options="recipientTypeOptions" :compose-state="composeState" :draft-saving="draftSaving"
      :sending="sending" @update:compose-open="composeOpen = $event" @update:recipient-type="handleRecipientTypeChange"
      @add-cc-field="addCcField" @remove-cc-field="removeCcField" @add-bcc-field="addBccField"
      @remove-bcc-field="removeBccField" @save-draft="onSaveDraft" @send-mail="onSendMail" />

    <TheConfirmModal />
  </div>
</template>
