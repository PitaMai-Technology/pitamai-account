export type MailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
};

export type MailListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  hasAttachment: boolean;
  seen: boolean;
};

export type MailAttachment = {
  filename: string | null;
  contentType: string;
  size: number;
  contentDisposition: string;
};

export type MailDetail = {
  uid: number;
  subject: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: MailAttachment[];
  isGpgSigned: boolean;
  pgpDetachedSignature: string | null;
  pgpDetachedSignedDataBase64: string | null;
  pgpEncryptedMessage: string | null;
};

export type ComposeRecipientType = 'to' | 'cc' | 'bcc';

export type ComposeState = {
  to: string;
  ccList: string[];
  bccList: string[];
  subject: string;
  text: string;
  files: File[];
  sign: boolean;
  encrypt: boolean;
};

export type GpgVerifyCacheItem = {
  status: 'valid' | 'invalid' | 'unknown';
  detail: string;
};

type TimedCacheEntry<T> = {
  value: T;
  cachedAt: number;
};
type MailListTimedCacheMap = Record<string, TimedCacheEntry<MailListItem[]>>;
type MailDetailTimedCacheMap = Record<string, TimedCacheEntry<MailDetail>>;

const MAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const MAIL_CACHE_MAX_ITEMS = 500;

function createInitialComposeState(): ComposeState {
  return {
    to: '',
    ccList: [''],
    bccList: [''],
    subject: '',
    text: '',
    files: [],
    sign: false,
    encrypt: false,
  };
}

export const useMailStore = defineStore('mail', () => {
  const activeAccountId = ref<string | null>(null);
  const activeFolderPath = ref('INBOX');

  const folders = ref<MailFolder[]>([]);
  const mailList = ref<MailListItem[]>([]);
  const currentMail = ref<MailDetail | null>(null);

  const selectedUid = ref<number | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);
  const composeOpen = ref(false);
  const sending = ref(false);
  const draftSaving = ref(false);
  const creatingFolder = ref(false);
  const folderActionLoading = ref(false);
  const newFolderName = ref('');
  const openingUid = ref<number | null>(null);
  const multiSelectedUids = ref<number[]>([]);
  const shiftDragBulkEnabled = ref(false);
  const shiftDragSelectedUids = ref<number[]>([]);
  const recipientType = ref<ComposeRecipientType>('to');
  const composeState = reactive<ComposeState>(createInitialComposeState());
  const gpgVerifyCache = ref<Record<string, GpgVerifyCacheItem>>({});
  const mailListCache = ref<MailListTimedCacheMap>({});
  const mailDetailCache = ref<MailDetailTimedCacheMap>({});

  const selectedMail = computed(() => {
    if (selectedUid.value === null) return null;
    return mailList.value.find(item => item.uid === selectedUid.value) ?? null;
  });

  function setActiveAccount(accountId: string | null) {
    activeAccountId.value = accountId;
    clearViewState();
  }

  function setActiveFolder(folderPath: string) {
    activeFolderPath.value = folderPath;
    clearMailSelection();
  }

  function setFolders(items: MailFolder[]) {
    folders.value = items;
  }

  function setMailList(items: MailListItem[]) {
    mailList.value = items;
  }

  function setCurrentMail(mail: MailDetail | null) {
    currentMail.value = mail;
    selectedUid.value = mail?.uid ?? null;
  }

  function selectUid(uid: number | null) {
    selectedUid.value = uid;
  }

  function setLoading(value: boolean) {
    isLoading.value = value;
  }

  function setError(message: string | null) {
    errorMessage.value = message;
  }

  function clearMailSelection() {
    selectedUid.value = null;
    currentMail.value = null;
  }

  function clearInteractionState() {
    openingUid.value = null;
    multiSelectedUids.value = [];
    shiftDragBulkEnabled.value = false;
    shiftDragSelectedUids.value = [];
  }

  function buildMailDetailCacheKey(folderPath: string, uid: number) {
    return `${folderPath}:${uid}`;
  }

  function trimCacheEntries<T>(target: Record<string, TimedCacheEntry<T>>) {
    const entries = Object.entries(target);
    if (entries.length <= MAIL_CACHE_MAX_ITEMS) {
      return;
    }

    entries
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
      .slice(0, entries.length - MAIL_CACHE_MAX_ITEMS)
      .forEach(([key]) => {
        delete target[key];
      });
  }

  function isExpired(cachedAt: number) {
    return Date.now() - cachedAt > MAIL_CACHE_TTL_MS;
  }

  function getCachedMailList(folderPath: string): MailListItem[] | null {
    const entry = mailListCache.value[folderPath];
    if (!entry) {
      return null;
    }

    if (isExpired(entry.cachedAt)) {
      delete mailListCache.value[folderPath];
      return null;
    }

    return entry.value;
  }

  function setCachedMailList(folderPath: string, items: MailListItem[]) {
    mailListCache.value[folderPath] = {
      value: items,
      cachedAt: Date.now(),
    };
    trimCacheEntries(mailListCache.value);
  }

  function getCachedMailDetail(
    folderPath: string,
    uid: number
  ): MailDetail | null {
    const key = buildMailDetailCacheKey(folderPath, uid);
    const entry = mailDetailCache.value[key];
    if (!entry) {
      return null;
    }

    if (isExpired(entry.cachedAt)) {
      delete mailDetailCache.value[key];
      return null;
    }

    return entry.value;
  }

  function setCachedMailDetail(folderPath: string, mail: MailDetail) {
    mailDetailCache.value[buildMailDetailCacheKey(folderPath, mail.uid)] = {
      value: mail,
      cachedAt: Date.now(),
    };
    trimCacheEntries(mailDetailCache.value);
  }

  function clearMailDataCache() {
    mailListCache.value = {};
    mailDetailCache.value = {};
  }

  function getGpgVerifyCache(key: string): GpgVerifyCacheItem | null {
    return gpgVerifyCache.value[key] ?? null;
  }

  function setGpgVerifyCache(key: string, value: GpgVerifyCacheItem) {
    gpgVerifyCache.value[key] = value;
  }

  function clearGpgVerifyCache() {
    gpgVerifyCache.value = {};
  }

  function resetComposeState() {
    const initial = createInitialComposeState();
    composeState.to = initial.to;
    composeState.ccList = initial.ccList;
    composeState.bccList = initial.bccList;
    composeState.subject = initial.subject;
    composeState.text = initial.text;
    composeState.files = initial.files;
    composeState.sign = initial.sign;
    composeState.encrypt = initial.encrypt;
    recipientType.value = 'to';
  }

  function clearViewState() {
    folders.value = [];
    mailList.value = [];
    clearMailSelection();
    clearInteractionState();
    clearGpgVerifyCache();
    clearMailDataCache();
    errorMessage.value = null;
  }

  return {
    activeAccountId,
    activeFolderPath,
    folders,
    mailList,
    currentMail,
    selectedUid,
    selectedMail,
    isLoading,
    errorMessage,
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
    gpgVerifyCache,
    mailListCache,
    mailDetailCache,
    recipientType,
    composeState,
    setActiveAccount,
    setActiveFolder,
    setFolders,
    setMailList,
    setCurrentMail,
    selectUid,
    setLoading,
    setError,
    getCachedMailList,
    setCachedMailList,
    getCachedMailDetail,
    setCachedMailDetail,
    clearMailDataCache,
    clearMailSelection,
    clearInteractionState,
    getGpgVerifyCache,
    setGpgVerifyCache,
    clearGpgVerifyCache,
    resetComposeState,
    clearViewState,
  };
});
