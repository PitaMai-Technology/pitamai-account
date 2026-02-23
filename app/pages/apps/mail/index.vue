<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMailStore } from '~/stores/mail';

definePageMeta({
  layout: 'the-app',
});

type MailAccountItem = {
  id: string;
  label: string | null;
  emailAddress: string;
};

type MailboxItem = {
  path: string;
  name: string;
  specialUse: string | null;
};

type MailboxResponseItem = {
  path: string;
  name: string;
  specialUse: string | null;
};

type MailGroup = {
  key: string;
  sender: string;
  messages: (typeof mailList.value)[number][];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toast = useToast();
const mailStore = useMailStore();

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
const streamConnected = ref(false);
const realtimeFolderPath = 'INBOX';
let stream: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
const lastRealtimeToastAt = ref(0);
const lastKnownTopUid = ref<number | null>(null);

const recipientTypeOptions = [
  { label: 'To', value: 'to' },
  { label: 'Cc', value: 'cc' },
  { label: 'Bcc', value: 'bcc' },
];

function addCcField() {
  composeState.ccList.push('');
}

function removeCcField(index: number) {
  if (composeState.ccList.length <= 1) {
    composeState.ccList[0] = '';
    return;
  }
  composeState.ccList.splice(index, 1);
}

function addBccField() {
  composeState.bccList.push('');
}

function removeBccField(index: number) {
  if (composeState.bccList.length <= 1) {
    composeState.bccList[0] = '';
    return;
  }
  composeState.bccList.splice(index, 1);
}

const folderOptions = computed(() =>
  folders.value.map(folder => ({
    label: getFolderDisplay(folder).label,
    value: folder.path,
  }))
);

function normalizeFolderPath(path: string) {
  return path.trim().toLowerCase();
}

function getFolderDisplay(folder: MailboxItem) {
  const normalizedPath = normalizeFolderPath(folder.path);
  const special = (folder.specialUse ?? '').toLowerCase();

  if (special === '\\inbox' || normalizedPath === 'inbox') {
    return { label: '受信トレイ', icon: 'i-lucide-inbox', protected: true };
  }
  if (special === '\\drafts' || normalizedPath.includes('draft')) {
    return { label: '下書き', icon: 'i-lucide-file-pen-line', protected: true };
  }
  if (special === '\\sent' || normalizedPath.includes('sent')) {
    return { label: '送信済み', icon: 'i-lucide-send', protected: true };
  }
  if (special === '\\trash' || normalizedPath.includes('trash') || normalizedPath.includes('deleted')) {
    return { label: 'ゴミ箱', icon: 'i-lucide-trash-2', protected: true };
  }
  if (normalizedPath.includes('spam') || normalizedPath.includes('junk')) {
    return { label: '迷惑メール', icon: 'i-lucide-shield-alert', protected: true };
  }
  if (special === '\\archive' || normalizedPath.includes('archive')) {
    return { label: 'アーカイブ', icon: 'i-lucide-archive', protected: true };
  }

  return {
    label: folder.name || folder.path,
    icon: 'i-lucide-folder',
    protected: false,
  };
}

const activeFolder = computed(() =>
  folders.value.find(folder => folder.path === activeFolderPath.value) ?? null
);

const canEditActiveFolder = computed(() => {
  if (!activeFolder.value) return false;
  return !getFolderDisplay(activeFolder.value).protected;
});

const selectedAccount = computed(() => {
  return accounts.value[0] ?? null;
});

const selectedMessage = computed(() => {
  if (selectedUid.value === null) return null;
  return mailList.value.find(item => item.uid === selectedUid.value) ?? null;
});

const currentFolder = computed(() =>
  folders.value.find(folder => folder.path === activeFolderPath.value) ?? null
);

const isTrashFolder = computed(() => {
  const specialUse = currentFolder.value?.specialUse?.toLowerCase();
  if (specialUse === '\\trash') return true;

  const path = activeFolderPath.value.toLowerCase();
  return (
    path.includes('trash') ||
    path.includes('deleted') ||
    path.includes('ごみ箱')
  );
});

const isSentFolder = computed(() => {
  const specialUse = currentFolder.value?.specialUse?.toLowerCase();
  if (specialUse === '\\sent') return true;

  const path = activeFolderPath.value.toLowerCase();
  return path.includes('sent') || path.includes('送信済み');
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

const isDraftFolder = computed(() => {
  const specialUse = currentFolder.value?.specialUse?.toLowerCase();
  if (specialUse === '\\drafts') return true;

  const path = activeFolderPath.value.toLowerCase();
  return path.includes('draft') || path.includes('下書き');
});

const selectedSeen = computed(() => {
  if (selectedUid.value === null) return null;
  return selectedMessage.value?.seen ?? null;
});

const hasSelectedMail = computed(() => selectedUid.value !== null);

function extractSenderAddress(from: string | null) {
  if (!from) return 'unknown';

  const matched = from.match(/<([^>]+)>/);
  if (matched?.[1]) {
    return matched[1].trim().toLowerCase();
  }

  return from.trim().toLowerCase();
}

function isReplySubject(subject: string | null) {
  if (!subject) return false;
  return /^re(\[\d+\])?\s*:/i.test(subject.trim());
}

function normalizeThreadSubject(subject: string | null) {
  const raw = (subject ?? '').trim();
  if (!raw) return '(件名なし)';

  let normalized = raw;
  while (/^re(\[\d+\])?\s*:/i.test(normalized)) {
    normalized = normalized.replace(/^re(\[\d+\])?\s*:/i, '').trim();
  }

  return normalized.toLowerCase() || '(件名なし)';
}

function isWithinOneDay(dateText: string | null) {
  if (!dateText) return false;

  const time = new Date(dateText).getTime();
  if (Number.isNaN(time)) return false;

  return Date.now() - time <= ONE_DAY_MS;
}

function messageButtonClass(message: (typeof mailList.value)[number]) {
  if (selectedUid.value === message.uid) {
    return 'border-gray-400 bg-gray-50';
  }

  return message.seen
    ? 'border-gray-200 bg-white'
    : 'border-emerald-400 bg-white';
}

const groupedMailList = computed<MailGroup[]>(() => {
  const groups: MailGroup[] = [];
  const threadGroupIndex = new Map<string, number>();

  for (const message of mailList.value) {
    const senderKey = extractSenderAddress(message.from);
    const replyThreadingEnabled =
      senderKey !== 'unknown' &&
      isReplySubject(message.subject) &&
      isWithinOneDay(message.date);

    if (replyThreadingEnabled) {
      const threadKey = `${senderKey}:${normalizeThreadSubject(message.subject)}`;
      const existingIndex = threadGroupIndex.get(threadKey);

      if (existingIndex !== undefined) {
        const existing = groups[existingIndex];
        if (existing) {
          existing.messages.push(message);
        }
        continue;
      }

      threadGroupIndex.set(threadKey, groups.length);
      groups.push({
        key: `thread:${threadKey}`,
        sender: message.from || '-',
        messages: [message],
      });
      continue;
    }

    groups.push({
      key: `single:${message.uid}`,
      sender: message.from || '-',
      messages: [message],
    });
  }

  return groups;
});

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 || '');
    };
    reader.onerror = () => reject(new Error('添付ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

async function loadAccounts() {
  try {
    const response = await $fetch<{ accounts: MailAccountItem[] }>('/api/pitamai/mail/accounts');
    accounts.value = response.accounts;

  } catch (error) {
    toast.add({
      title: 'エラー',
      description: error instanceof Error ? error.message : 'メールアカウント取得に失敗しました',
      color: 'error',
    });
  }
}

async function loadFolders() {
  if (!hasMailSetting.value) return;

  try {
    isLoading.value = true;

    const response = await $fetch<{ mailboxes: MailboxResponseItem[] }>('/api/pitamai/mail/imap-test');

    const mapped = response.mailboxes.map(box => ({
      path: box.path,
      name: box.name,
      specialUse: box.specialUse,
    }));

    mailStore.setFolders(mapped);

    if (!mapped.some(folder => folder.path === activeFolderPath.value) && mapped.length > 0) {
      const firstFolder = mapped[0];
      if (firstFolder) {
        mailStore.setActiveFolder(firstFolder.path);
      }
    }
  } catch (error) {
    toast.add({
      title: 'エラー',
      description: error instanceof Error ? error.message : 'フォルダ取得に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

async function onCreateFolder() {
  if (creatingFolder.value) return;

  const name = newFolderName.value.trim();
  if (!name) return;

  creatingFolder.value = true;
  try {
    const response = await $fetch<{ mailboxes: MailboxResponseItem[] }>('/api/pitamai/mail/folder-create', {
      method: 'POST',
      body: { name },
    });

    mailStore.setFolders(response.mailboxes);
    newFolderName.value = '';

    toast.add({
      title: '作成しました',
      description: 'フォルダを作成しました',
      color: 'success',
    });
  } catch (error) {
    toast.add({
      title: '作成失敗',
      description: error instanceof Error ? error.message : 'フォルダ作成に失敗しました',
      color: 'error',
    });
  } finally {
    creatingFolder.value = false;
  }
}

async function onRenameFolder() {
  if (!activeFolder.value || !canEditActiveFolder.value || folderActionLoading.value) return;

  const sourcePath = activeFolder.value.path;

  const nextName = window.prompt('新しいフォルダ名を入力してください', activeFolder.value.name || sourcePath);
  if (!nextName || !nextName.trim()) return;

  folderActionLoading.value = true;
  try {
    const response = await $fetch<{ mailboxes: MailboxResponseItem[] }>('/api/pitamai/mail/folder-rename', {
      method: 'POST',
      body: {
        path: sourcePath,
        newName: nextName.trim(),
      },
    });

    mailStore.setFolders(response.mailboxes);
    if (activeFolderPath.value === sourcePath) {
      mailStore.setActiveFolder(nextName.trim());
    }
    toast.add({
      title: '変更しました',
      description: 'フォルダ名を変更しました',
      color: 'success',
    });
  } catch (error) {
    toast.add({
      title: '変更失敗',
      description: error instanceof Error ? error.message : 'フォルダ名の変更に失敗しました',
      color: 'error',
    });
  } finally {
    folderActionLoading.value = false;
  }
}

async function onDeleteFolder() {
  if (!activeFolder.value || !canEditActiveFolder.value || folderActionLoading.value) return;

  const targetPath = activeFolder.value.path;
  const targetName = activeFolder.value.name || targetPath;

  const confirmed = window.confirm(`フォルダ「${targetName}」を削除しますか？`);
  if (!confirmed) return;

  folderActionLoading.value = true;
  try {
    const response = await $fetch<{ mailboxes: MailboxResponseItem[] }>('/api/pitamai/mail/folder-delete', {
      method: 'POST',
      body: {
        path: targetPath,
      },
    });

    mailStore.setFolders(response.mailboxes);

    if (activeFolderPath.value === targetPath) {
      const first = response.mailboxes[0];
      if (first) {
        mailStore.setActiveFolder(first.path);
      }
    }

    toast.add({
      title: '削除しました',
      description: 'フォルダを削除しました',
      color: 'success',
    });
  } catch (error) {
    toast.add({
      title: '削除失敗',
      description: error instanceof Error ? error.message : 'フォルダ削除に失敗しました',
      color: 'error',
    });
  } finally {
    folderActionLoading.value = false;
  }
}

async function onDropMailToFolder(uid: number, toFolderPath: string) {
  if (!activeFolderPath.value) return;
  if (activeFolderPath.value === toFolderPath) return;

  const targetUids = shiftDragBulkEnabled.value
    ? shiftDragSelectedUids.value
    : [uid];

  try {
    for (const targetUid of targetUids) {
      await $fetch('/api/pitamai/mail/move-to-folder', {
        method: 'POST',
        body: {
          uid: targetUid,
          fromFolder: activeFolderPath.value,
          toFolder: toFolderPath,
        },
      });
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
    shiftDragBulkEnabled.value = false;
    shiftDragSelectedUids.value = [];
    multiSelectedUids.value = [];
  }
}

function onMailDragStart(payload: { uid: number; shiftKey: boolean }) {
  const isInSelected = multiSelectedUids.value.includes(payload.uid);

  if ((payload.shiftKey || isInSelected) && multiSelectedUids.value.length > 0) {
    shiftDragBulkEnabled.value = true;
    shiftDragSelectedUids.value = multiSelectedUids.value.includes(payload.uid)
      ? [...multiSelectedUids.value]
      : [...multiSelectedUids.value, payload.uid];
    return;
  }

  shiftDragBulkEnabled.value = false;
  shiftDragSelectedUids.value = [payload.uid];
}

function isUidMultiSelected(uid: number) {
  return multiSelectedUids.value.includes(uid);
}

function onMailItemClick(payload: { uid: number; shiftKey: boolean }) {
  if (!payload.shiftKey) {
    multiSelectedUids.value = [];
    return;
  }

  if (multiSelectedUids.value.includes(payload.uid)) {
    multiSelectedUids.value = multiSelectedUids.value.filter(uid => uid !== payload.uid);
    return;
  }

  multiSelectedUids.value = [...multiSelectedUids.value, payload.uid];
}

function splitRecipientList(value: string | null) {
  if (!value) return [''];

  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);

  return items.length > 0 ? items : [''];
}

function onUseDraftForCompose() {
  if (!currentMail.value) return;

  composeState.to = currentMail.value.to ?? '';
  composeState.ccList = splitRecipientList(currentMail.value.cc);
  composeState.bccList = splitRecipientList(currentMail.value.bcc);
  composeState.subject = currentMail.value.subject ?? '';
  composeState.text = currentMail.value.text ?? '';
  recipientType.value = 'to';
  composeOpen.value = true;
}

async function loadMessages(options?: {
  markOpenedAsRead?: boolean;
  notifyIfNew?: boolean;
  forceSync?: boolean;
}) {
  const markOpenedAsRead = options?.markOpenedAsRead ?? false;
  const notifyIfNew = options?.notifyIfNew ?? false;
  const forceSync = options?.forceSync ?? false;

  if (!hasMailSetting.value) return;

  try {
    isLoading.value = true;

    const response = await $fetch<{
      messages: Array<{
        uid: number;
        subject: string | null;
        from: string | null;
        date: string | null;
        hasAttachment: boolean;
        seen: boolean;
      }>;
    }>('/api/pitamai/mail/messages', {
      query: {
        folder: activeFolderPath.value,
        limit: 50,
        forceSync,
      },
    });

    const nextTopUid = response.messages[0]?.uid ?? null;
    const prevTopUid = lastKnownTopUid.value;

    if (
      notifyIfNew &&
      prevTopUid !== null &&
      nextTopUid !== null &&
      nextTopUid > prevTopUid
    ) {
      maybeNotifyNewMail();
    }

    lastKnownTopUid.value = nextTopUid;

    mailStore.setMailList(response.messages);

    if (response.messages.length > 0) {
      const selected =
        selectedUid.value !== null
          ? response.messages.find(item => item.uid === selectedUid.value)
          : null;

      const target = selected ?? response.messages[0];
      if (target) {
        const isSameAsCurrent =
          currentMail.value?.uid === target.uid && selectedUid.value === target.uid;

        if (!isSameAsCurrent) {
          await openMessage(target.uid, markOpenedAsRead);
        }
      }
    } else {
      mailStore.setCurrentMail(null);
      mailStore.selectUid(null);
    }
  } catch (error) {
    toast.add({
      title: 'エラー',
      description: error instanceof Error ? error.message : 'メール一覧取得に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

function maybeNotifyNewMail() {
  const now = Date.now();
  if (now - lastRealtimeToastAt.value < 5000) {
    return;
  }

  lastRealtimeToastAt.value = now;
  toast.add({
    title: '新着通知',
    description: '新しいメールが来ています。',
    color: 'info',
  });
}

async function openMessage(uid: number, markAsRead = true) {
  if (!hasMailSetting.value) return;
  if (openingUid.value === uid) return;

  try {
    openingUid.value = uid;
    selectedUid.value = uid;
    const listItem = mailList.value.find(item => item.uid === uid);

    const response = await $fetch<{
      message: {
        uid: number;
        subject: string | null;
        from: string | null;
        to: string | null;
        cc: string | null;
        bcc: string | null;
        date: string | null;
        text: string | null;
        html: string | null;
        attachments: Array<{
          filename: string | null;
          contentType: string;
          size: number;
          contentDisposition: string;
        }>;
      };
    }>('/api/pitamai/mail/message', {
      query: {
        folder: activeFolderPath.value,
        uid,
      },
    });

    mailStore.setCurrentMail(response.message);

    if (markAsRead && listItem && !listItem.seen) {
      await $fetch('/api/pitamai/mail/seen', {
        method: 'POST',
        body: {
          folder: activeFolderPath.value,
          uid,
          seen: true,
        },
      });

      const target = mailList.value.find(item => item.uid === uid);
      if (target) {
        target.seen = true;
      }
    }
  } catch (error) {
    toast.add({
      title: 'エラー',
      description: error instanceof Error ? error.message : 'メール詳細取得に失敗しました',
      color: 'error',
    });
  } finally {
    if (openingUid.value === uid) {
      openingUid.value = null;
    }
  }
}

async function onToggleSeen() {
  if (!hasSelectedMail.value || selectedSeen.value === null) return;

  try {
    await $fetch('/api/pitamai/mail/seen', {
      method: 'POST',
      body: {
        folder: activeFolderPath.value,
        uid: selectedUid.value,
        seen: !selectedSeen.value,
      },
    });

    await loadMessages();
  } catch (error) {
    toast.add({
      title: 'エラー',
      description: error instanceof Error ? error.message : '既読更新に失敗しました',
      color: 'error',
    });
  }
}

async function onMove(destination: 'trash' | 'archive' | 'inbox') {
  if (!hasSelectedMail.value) return;

  try {
    await $fetch('/api/pitamai/mail/move', {
      method: 'POST',
      body: {
        folder: activeFolderPath.value,
        uid: selectedUid.value,
        destination,
      },
    });

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

async function onSendMail() {
  if (sending.value) return;

  const to = composeState.to.trim();
  const cc = composeState.ccList
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .join(',');
  const bcc = composeState.bccList
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .join(',');

  if (!to && !cc && !bcc) {
    toast.add({
      title: '入力エラー',
      description: 'To/Cc/Bcc のいずれかを入力してください',
      color: 'error',
    });
    return;
  }

  sending.value = true;
  try {
    const attachments = await Promise.all(
      composeState.files.map(async file => ({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: await toBase64(file),
      }))
    );

    const sendResult = await $fetch<{
      ok: true;
      messageId: string;
      accepted: string[];
      sentStored: boolean;
      sentMailbox: string | null;
    }>('/api/pitamai/mail/send', {
      method: 'POST',
      body: {
        to: to || undefined,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: composeState.subject,
        text: composeState.text,
        attachments,
      },
    });

    if (sendResult.sentStored) {
      toast.add({
        title: '送信しました',
        description: 'メールを送信し、送信済みフォルダへ保存しました',
        color: 'success',
      });
    } else {
      toast.add({
        title: '送信は成功しました',
        description: '送信済みフォルダへの保存に失敗しました',
        color: 'warning',
      });
    }

    mailStore.resetComposeState();
    composeOpen.value = false;
  } catch (error) {
    toast.add({
      title: '送信失敗',
      description: error instanceof Error ? error.message : 'メール送信に失敗しました',
      color: 'error',
    });
  } finally {
    sending.value = false;
  }
}

async function onSaveDraft() {
  if (draftSaving.value) return;

  const to = composeState.to.trim();
  const cc = composeState.ccList
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .join(',');
  const bcc = composeState.bccList
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .join(',');

  draftSaving.value = true;
  try {
    const attachments = await Promise.all(
      composeState.files.map(async file => ({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: await toBase64(file),
      }))
    );

    const result = await $fetch<{
      ok: true;
      stored: boolean;
      mailbox: string | null;
    }>('/api/pitamai/mail/draft', {
      method: 'POST',
      body: {
        to: to || undefined,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: composeState.subject,
        text: composeState.text,
        attachments,
      },
    });

    toast.add({
      title: '下書きを保存しました',
      description: result.mailbox
        ? `保存先: ${result.mailbox}`
        : '下書きフォルダに保存しました',
      color: 'success',
    });
  } catch (error) {
    toast.add({
      title: '下書き保存に失敗しました',
      description: error instanceof Error ? error.message : '下書き保存に失敗しました',
      color: 'error',
    });
  } finally {
    draftSaving.value = false;
  }
}

function startRealtimeStream() {
  if (!import.meta.client) return;
  if (!hasMailSetting.value) return;
  if (stream) return;

  const url = `/api/pitamai/mail/stream?folder=${encodeURIComponent(realtimeFolderPath)}`;
  stream = new EventSource(url);

  stream.addEventListener('connected', () => {
    streamConnected.value = true;
    reconnectAttempt = 0;
  });

  stream.addEventListener('ready', () => {
    streamConnected.value = true;
  });

  stream.addEventListener('heartbeat', () => {
    streamConnected.value = true;
  });

  stream.addEventListener('new-mail', async () => {
    maybeNotifyNewMail();
    await loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: true,
      forceSync: true,
    });
  });

  stream.addEventListener('error', () => {
    streamConnected.value = false;
    if (stream) {
      stream.close();
      stream = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (!hasMailSetting.value) return;

    const delay = Math.min(5000, 500 * (reconnectAttempt + 1));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startRealtimeStream();
    }, delay);
  });
}

function stopRealtimeStream() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (!stream) return;
  stream.close();
  stream = null;
  streamConnected.value = false;
}

watch(hasMailSetting, async enabled => {
  if (!enabled) {
    stopRealtimeStream();
    return;
  }

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
});

onBeforeUnmount(() => {
  stopRealtimeStream();
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

    <UAlert v-if="!hasMailSetting" color="warning" variant="soft" title="メールサーバー設定が未登録です"
      description="個人設定ページで IMAP/SMTP を登録してください。" :actions="[{ label: '設定を開く', to: '/apps/users/settings' }]" />

    <div class="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-12">
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="space-y-2">
            <h2 class="text-sm font-semibold mb-2">フォルダ</h2>
          </div>
          <UCollapsible class="flex flex-col gap-2 w-fit">
            <UButton class="text-xs p-1 w-fit" label="フォルダ編集" color="neutral" variant="subtle"
              trailing-icon="i-lucide-settings" block />

            <template #content>
              <div class="flex gap-1">
                <UFieldGroup>
                  <UInput v-model="newFolderName" size="xs" placeholder="新規フォルダ名" />
                  <UButton size="xs" icon="i-lucide-plus" :loading="creatingFolder" @click="onCreateFolder">
                  </UButton>
                </UFieldGroup>
              </div>
              <div class="flex gap-1">
                <UFieldGroup>
                  <UButton size="xs" color="neutral" variant="outline" :disabled="!canEditActiveFolder"
                    :loading="folderActionLoading" @click="onRenameFolder">
                    名前変更
                  </UButton>
                  <UButton size="xs" color="error" variant="outline" :disabled="!canEditActiveFolder"
                    :loading="folderActionLoading" @click="onDeleteFolder">
                    削除
                  </UButton>
                </UFieldGroup>
              </div>
            </template>
          </UCollapsible>
        </template>
        <div class="space-y-1">
          <AppMailDroppableFolder v-for="folder in folders" :key="folder.path" :folder="folder"
            :active-folder-path="activeFolderPath" :icon="getFolderDisplay(folder).icon"
            :label="getFolderDisplay(folder).label" @select="mailStore.setActiveFolder"
            @drop-mail="onDropMailToFolder" />
        </div>
      </UCard>

      <UCard class="lg:col-span-4">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">メール一覧</h2>
            <UButton size="xs" color="neutral" icon="i-lucide-refresh-cw" variant="outline" :disabled="isLoading"
              :loading="isLoading"
              @click="loadMessages({ markOpenedAsRead: false, notifyIfNew: false, forceSync: true })">
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
                :multi-selected="isUidMultiSelected(group.messages[0]!.uid)" @open="uid => openMessage(uid, true)"
                @drag-start="onMailDragStart" @item-click="onMailItemClick" />
            </div>

            <UCollapsible v-if="group.messages.length > 1" class="pl-3">
              <UButton color="neutral" variant="ghost" size="xs" trailing-icon="i-lucide-chevron-down" class="mb-1"
                label="返信履歴を表示" />
              <template #content>
                <div class="space-y-1 border-l border-gray-200 pl-3">
                  <AppMailDraggableItem v-for="message in group.messages.slice(1)" :key="message.uid" :message="message"
                    :selected-uid="selectedUid" :opening-uid="openingUid"
                    :multi-selected="isUidMultiSelected(message.uid)" @open="uid => openMessage(uid, true)"
                    @drag-start="onMailDragStart" @item-click="onMailItemClick" />
                </div>
              </template>
            </UCollapsible>
          </template>
        </div>
      </UCard>

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
              <UButton size="xs" color="neutral" variant="outline" :disabled="!hasSelectedMail" @click="onToggleSeen">
                {{ selectedSeen ? '未読にする' : '既読にする' }}
              </UButton>
              <UButton size="xs" color="neutral" variant="outline" :disabled="!hasSelectedMail"
                @click="onMove('archive')">
                アーカイブ
              </UButton>
              <UButton size="xs" color="error" variant="outline" :disabled="!hasSelectedMail" @click="onMove('trash')">
                削除
              </UButton>
              <UButton v-if="isDraftFolder" size="xs" color="primary" variant="outline" :disabled="!hasSelectedMail"
                @click="onUseDraftForCompose">
                下書きから送信
              </UButton>
              <UButton v-if="isTrashFolder" size="xs" color="success" variant="outline" :disabled="!hasSelectedMail"
                @click="onMove('inbox')">
                戻す
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="currentMail?.attachments?.length" class="mb-4 space-y-1 rounded border border-gray-200 p-3">
          <p class="text-xs font-medium text-gray-700">添付ファイル</p>
          <p v-for="attachment in currentMail.attachments" :key="`${attachment.filename}-${attachment.size}`"
            class="text-xs text-gray-600">
            {{ attachment.filename || 'unnamed' }} ({{ attachment.size }} bytes)
          </p>
        </div>

        <AppMailBody :html="currentMail?.html" :text="currentMail?.text" />
      </UCard>
    </div>

    <div v-if="selectedAccount === null" class="text-sm text-gray-500">
      利用可能なメールアカウントがありません。先に `MailAccount` を作成してください。
    </div>

    <UModal v-model:open="composeOpen" title="新規メール作成" class="max-w-5xl">
      <template #body>
        <div class="space-y-3">
          <UFormField label="宛先種別">
            <USelect v-model="recipientType" :items="recipientTypeOptions" class="w-40" />
          </UFormField>

          <UFormField v-if="recipientType === 'to'" label="To" required>
            <UInput v-model="composeState.to" placeholder="to@example.com" />
          </UFormField>

          <UFormField v-if="recipientType === 'cc'" label="Cc" required>
            <div class="space-y-2">
              <div v-for="(cc, index) in composeState.ccList" :key="`cc-${index}`" class="flex items-center gap-2">
                <UInput v-model="composeState.ccList[index]" placeholder="cc@example.com" class="w-full" />
                <UButton color="neutral" variant="outline" size="xs" @click="addCcField">
                  +
                </UButton>
                <UButton color="error" variant="outline" size="xs" @click="removeCcField(index)">
                  -
                </UButton>
              </div>
            </div>
          </UFormField>

          <UFormField v-if="recipientType === 'bcc'" label="Bcc" required>
            <div class="space-y-2">
              <div v-for="(bcc, index) in composeState.bccList" :key="`bcc-${index}`" class="flex items-center gap-2">
                <UInput v-model="composeState.bccList[index]" placeholder="bcc@example.com" class="w-full" />
                <UButton color="neutral" variant="outline" size="xs" @click="addBccField">
                  +
                </UButton>
                <UButton color="error" variant="outline" size="xs" @click="removeBccField(index)">
                  -
                </UButton>
              </div>
            </div>
          </UFormField>
          <UFormField label="件名" required>
            <UInput v-model="composeState.subject" placeholder="件名" />
          </UFormField>
          <UFormField label="本文">
            <UTextarea class="w-full" v-model="composeState.text" :rows="10" />
          </UFormField>
          <UFormField label="添付ファイル">
            <UFileUpload v-model="composeState.files" multiple />
            <p class="mt-1 text-xs text-gray-500" v-if="composeState.files.length">
              {{ composeState.files.length }} 件選択中
            </p>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="composeOpen = false">キャンセル</UButton>
          <UButton color="neutral" variant="outline" :loading="draftSaving" @click="onSaveDraft">下書き保存</UButton>
          <UButton color="primary" :loading="sending" @click="onSendMail">送信</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
