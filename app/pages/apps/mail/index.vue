<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMailApi } from '~/composable/useMailApi';
import { useMailCompose } from '~/composable/useMailCompose';
import { useMailFolders } from '~/composable/useMailFolders';
import { useMailMessages } from '~/composable/useMailMessages';
import { useMailRealtime } from '~/composable/useMailRealtime';
import { useMailSelection } from '~/composable/useMailSelection';
import { useMailStore } from '~/stores/mail';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({
  layout: 'the-app',
});

type MailAccountItem = {
  id: string;
  label: string | null;
  emailAddress: string;
};

const toast = useToast();
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

const accounts = ref<MailAccountItem[]>([]);
const hasMailSetting = computed(() => accounts.value.length > 0);
const imapReachable = ref<boolean | null>(null);
const smtpReachable = ref<boolean | null>(null);
let connectivityTimer: ReturnType<typeof setInterval> | null = null;

const showMailSettingAlert = computed(() => {
  if (!hasMailSetting.value) return true;
  return imapReachable.value === false || smtpReachable.value === false;
});

const mailSettingAlertDescription = computed(() => {
  if (!hasMailSetting.value) {
    return '個人設定ページで IMAP/SMTP を登録してください。';
  }

  if (imapReachable.value === false || smtpReachable.value === false) {
    return 'IMAP/SMTP の疎通に失敗しています。設定を確認してください。';
  }

  return '個人設定ページで IMAP/SMTP の設定をご確認ください。';
});
const realtimeFolderPath = 'INBOX';

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

const selectedAccount = computed(() => {
  return accounts.value[0] ?? null;
});

const selectedMessage = computed(() => {
  if (selectedUid.value === null) return null;
  return mailList.value.find(item => item.uid === selectedUid.value) ?? null;
});

const messageMetaLabel = computed(() =>
  isSentFolder.value ? '宛先(To)' : '差出人(From)'
);

const messageMetaValue = computed(() => {
  if (isSentFolder.value) {
    return currentMail.value?.to || '-';
  }

  return currentMail.value?.from || selectedMessage.value?.from || '-';
});

const messageCcValue = computed(() => {
  if (!isSentFolder.value) return null;
  return currentMail.value?.cc || '-';
});

const { open: confirmOpen, message: confirmMessage } = storeToRefs(confirmStore);
const { confirm: confirmDialog, resolve: resolveConfirm } = confirmStore;

// 
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

async function loadAccounts() {
  try {
    const response = await mailApi.getAccounts();
    accounts.value = response.accounts;

  } catch (error) {
    toast.add({
      title: 'エラー',
      description: error instanceof Error ? error.message : 'メールアカウント取得に失敗しました',
      color: 'error',
    });
  }
}

async function checkMailConnectivity() {
  if (!hasMailSetting.value) {
    imapReachable.value = null;
    smtpReachable.value = null;
    return;
  }

  const [imapResult, smtpResult] = await Promise.allSettled([
    mailApi.testImapConnection(),
    mailApi.testSmtpConnection(),
  ]);

  imapReachable.value = imapResult.status === 'fulfilled';
  smtpReachable.value = smtpResult.status === 'fulfilled';
}

function startConnectivityPolling() {
  if (connectivityTimer) {
    clearInterval(connectivityTimer);
  }

  connectivityTimer = setInterval(() => {
    checkMailConnectivity();
  }, 12 * 60 * 60 * 1000);
}

async function onDropMailToFolder(uid: number, toFolderPath: string) {
  if (!activeFolderPath.value) return;
  if (activeFolderPath.value === toFolderPath) return;

  const targetUids = resolveDropTargetUids(uid);

  try {
    for (const targetUid of targetUids) {
      await mailApi.moveToFolder(targetUid, activeFolderPath.value, toFolderPath);
    }

    toast.add({
      title: '移動しました',
      description:
        targetUids.length > 1
          ? `${targetUids.length}件のメールをフォルダへ移動しました`
          : 'メールをフォルダへ移動しました',
      color: 'success',
    });

    await loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: false,
      forceSync: true,
    });
  } catch (error) {
    toast.add({
      title: '移動失敗',
      description: error instanceof Error ? error.message : 'メール移動に失敗しました',
      color: 'error',
    });
  } finally {
    resetSelectionAfterDrop();
  }
}

async function onMove(destination: 'trash' | 'archive' | 'inbox') {
  if (!hasSelectedMail.value) return;

  const uid = selectedUid.value;
  if (uid === null) return;

  try {
    await mailApi.moveMessage(activeFolderPath.value, uid, destination);

    toast.add({
      title: '成功',
      description:
        destination === 'trash'
          ? 'ゴミ箱へ移動しました'
          : destination === 'archive'
            ? 'アーカイブしました'
            : '受信トレイへ戻しました',
      color: 'success',
    });

    await loadMessages();
  } catch (error) {
    toast.add({
      title: 'エラー',
      description:
        error instanceof Error
          ? error.message
          : destination === 'trash'
            ? '削除に失敗しました'
            : destination === 'archive'
              ? 'アーカイブに失敗しました'
              : '復元に失敗しました',
      color: 'error',
    });
  }
}

async function onOpenAttachment(index: number) {
  if (!currentMail.value) return;

  if (isSpamFolder.value) {
    toast.add({
      title: 'ブロックしました',
      description: '迷惑メールでは添付ファイルを開けません。',
      color: 'warning',
    });
    return;
  }

  const attachment = currentMail.value.attachments[index];
  if (!attachment) return;

  const confirmed = await confirmDialog(
    `添付ファイル「${attachment.filename ?? 'unnamed'}」を開きますか？`
  );

  if (!confirmed) return;

  const uid = selectedUid.value;
  if (uid === null) return;

  const url = `/api/pitamai/mail/attachment?folder=${encodeURIComponent(activeFolderPath.value)}&uid=${uid}&index=${index}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

watch(hasMailSetting, async enabled => {
  if (!enabled) {
    stopRealtimeStream();
    imapReachable.value = null;
    smtpReachable.value = null;
    return;
  }

  await checkMailConnectivity();
  await loadFolders();
  await loadMessages({ markOpenedAsRead: false, notifyIfNew: false });
  startRealtimeStream();
}, { immediate: true });

watch(activeFolderPath, async () => {
  if (!hasMailSetting.value) return;
  await loadMessages({ markOpenedAsRead: false, notifyIfNew: false });
});

onMounted(async () => {
  await loadAccounts();
  startConnectivityPolling();
});

onBeforeUnmount(() => {
  stopRealtimeStream();
  if (connectivityTimer) {
    clearInterval(connectivityTimer);
    connectivityTimer = null;
  }
});
</script>

<template>
  <div class="space-y-4">
    <UPageCard>
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-sm text-gray-600">
          アカウント: {{ selectedAccount?.emailAddress || '未設定' }}
        </p>
        <USelect v-model="activeFolderPath" class="w-56" :items="folderOptions" placeholder="フォルダを選択" />
        <UButton color="primary" icon="i-lucide-pencil" @click="composeOpen = true">新規作成</UButton>
      </div>
    </UPageCard>

    <UAlert v-if="showMailSettingAlert" color="warning" variant="soft" title="メールサーバーの設定がうまくいっていません"
      :description="mailSettingAlertDescription" :actions="[{ label: '設定を開く', to: '/apps/users/settings' }]" />

    <div class="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-12">

      <AppMailListPanel :is-loading="isLoading" :mail-list="mailList" :grouped-mail-list="groupedMailList"
        :selected-uid="selectedUid" :opening-uid="openingUid" :is-uid-multi-selected="isUidMultiSelected"
        @refresh="loadMessages({ markOpenedAsRead: false, notifyIfNew: false, forceSync: true })"
        @open="uid => openMessage(uid, true)" @drag-start="onMailDragStart" @item-click="onMailItemClick" />

      <AppMailDetailPanel :selected-message="selectedMessage" :current-mail="currentMail"
        :message-meta-label="messageMetaLabel" :message-meta-value="messageMetaValue" :is-sent-folder="isSentFolder"
        :message-cc-value="messageCcValue" :has-selected-mail="hasSelectedMail" :selected-seen="selectedSeen"
        :is-draft-folder="isDraftFolder" :is-trash-folder="isTrashFolder" :is-spam-folder="isSpamFolder"
        @toggle-seen="onToggleSeen" @move="onMove" @use-draft-compose="onUseDraftForCompose"
        @open-attachment="onOpenAttachment" />
    </div>

    <div v-if="selectedAccount === null" class="text-sm text-gray-500">
      利用可能なメールアカウントがありません。先に `MailAccount` を作成してください。
    </div>

    <AppMailComposeModal :compose-open="composeOpen" :recipient-type="recipientType"
      :recipient-type-options="recipientTypeOptions" :compose-state="composeState" :draft-saving="draftSaving"
      :sending="sending" @update:compose-open="composeOpen = $event" @update:recipient-type="recipientType = $event"
      @add-cc-field="addCcField" @remove-cc-field="removeCcField" @add-bcc-field="addBccField"
      @remove-bcc-field="removeBccField" @save-draft="onSaveDraft" @send-mail="onSendMail" />

    <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </div>
</template>
