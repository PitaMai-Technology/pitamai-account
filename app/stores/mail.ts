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
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: MailAttachment[];
};

export const useMailStore = defineStore('mail', () => {
  const activeAccountId = ref<string | null>(null);
  const activeFolderPath = ref('INBOX');

  const folders = ref<MailFolder[]>([]);
  const mailList = ref<MailListItem[]>([]);
  const currentMail = ref<MailDetail | null>(null);

  const selectedUid = ref<number | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);

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

  function clearViewState() {
    folders.value = [];
    mailList.value = [];
    clearMailSelection();
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
    setActiveAccount,
    setActiveFolder,
    setFolders,
    setMailList,
    setCurrentMail,
    selectUid,
    setLoading,
    setError,
    clearMailSelection,
    clearViewState,
  };
});
