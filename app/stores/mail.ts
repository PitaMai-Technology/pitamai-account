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
    clearMailSelection,
    clearInteractionState,
    resetComposeState,
    clearViewState,
  };
});
