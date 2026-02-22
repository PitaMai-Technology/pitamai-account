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

const toast = useToast();
const mailStore = useMailStore();

const {
  activeFolderPath,
  folders,
  mailList,
  currentMail,
  selectedUid,
  isLoading,
} = storeToRefs(mailStore);

const accounts = ref<MailAccountItem[]>([]);
const hasMailSetting = computed(() => accounts.value.length > 0);
const composeOpen = ref(false);
const sending = ref(false);
const streamConnected = ref(false);
const realtimeFolderPath = 'INBOX';
let stream: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
const lastRealtimeToastAt = ref(0);
const lastKnownTopUid = ref<number | null>(null);

const composeState = reactive({
  to: '',
  ccList: [''],
  bccList: [''],
  subject: '',
  text: '',
  files: [] as File[],
});

const recipientType = ref<'to' | 'cc' | 'bcc'>('to');
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
    label: folder.name || folder.path,
    value: folder.path,
  }))
);

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

const selectedSeen = computed(() => {
  if (selectedUid.value === null) return null;
  return selectedMessage.value?.seen ?? null;
});

const hasSelectedMail = computed(() => selectedUid.value !== null);

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

    const response = await $fetch<{ mailboxes: MailboxItem[] }>('/api/pitamai/mail/imap-test');

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
        await openMessage(target.uid, markOpenedAsRead);
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

  try {
    selectedUid.value = uid;
    const listItem = mailList.value.find(item => item.uid === uid);

    const response = await $fetch<{
      message: {
        uid: number;
        subject: string | null;
        from: string | null;
        to: string | null;
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

    composeState.to = '';
    composeState.ccList = [''];
    composeState.bccList = [''];
    composeState.subject = '';
    composeState.text = '';
    composeState.files = [];
    recipientType.value = 'to';
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
          利用中アカウント: {{ selectedAccount?.emailAddress || '未設定' }}
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
          <h2 class="text-sm font-semibold">フォルダ</h2>
        </template>
        <div class="space-y-1">
          <UButton v-for="folder in folders" :key="folder.path"
            :variant="activeFolderPath === folder.path ? 'solid' : 'ghost'" color="neutral" class="w-full justify-start"
            @click="mailStore.setActiveFolder(folder.path)">
            {{ folder.name || folder.path }}
          </UButton>
        </div>
      </UCard>

      <UCard class="lg:col-span-4">
        <template #header>
          <h2 class="text-sm font-semibold">メール一覧</h2>
        </template>

        <div v-if="isLoading" class="space-y-2">
          <USkeleton class="h-14 w-full bg-gray-100" />
          <USkeleton class="h-14 w-full bg-gray-100" />
          <USkeleton class="h-14 w-full bg-gray-100" />
        </div>

        <div v-else-if="mailList.length === 0" class="py-6 text-sm text-gray-500">
          メールがありません。
        </div>

        <div v-else class="space-y-1">
          <button v-for="message in mailList" :key="message.uid" type="button"
            class="w-full rounded border px-3 py-2 text-left" :class="selectedUid === message.uid
              ? 'border-gray-400 bg-gray-50'
              : message.seen
                ? 'border-gray-200 bg-white'
                : 'border-emerald-400 bg-white'
              " @click="openMessage(message.uid, true)">
            <p class="truncate text-sm font-medium">{{ message.subject || '(件名なし)' }}</p>
            <p class="truncate text-xs text-gray-600">{{ message.from || '-' }}</p>
            <p class="text-xs text-gray-500">{{ message.date ? new Date(message.date).toLocaleString('ja-JP') : '-' }}
            </p>
          </button>
        </div>
      </UCard>

      <UCard class="lg:col-span-6">
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="truncate text-sm font-semibold">
                {{ selectedMessage?.subject || currentMail?.subject || '(件名なし)' }}
              </h2>
              <p class="text-xs text-gray-600">{{ currentMail?.from || selectedMessage?.from || '-' }}</p>
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
          <UButton color="primary" :loading="sending" @click="onSendMail">送信</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
