import type { Ref } from 'vue';
import type { MailFolder } from '~/stores/mail';
import { useMailApi } from '~/composable/useMailApi';

// ==============================================================================
// IMAP フォルダ管理と表示制御
// ==============================================================================
// 役割: フォルダ一覧の取得・表示、CRUD操作、保護フォルダ判定
type UseMailFoldersParams = {
  hasMailSetting: Ref<boolean>;
  activeFolderPath: Ref<string>;
  folders: Ref<MailFolder[]>;
  isLoading: Ref<boolean>;
  creatingFolder: Ref<boolean>;
  folderActionLoading: Ref<boolean>;
  newFolderName: Ref<string>;
  setFolders: (items: MailFolder[]) => void;
  setActiveFolder: (path: string) => void;
};

export function useMailFolders(params: UseMailFoldersParams) {
  const toast = useToast();
  const mailApi = useMailApi();

  function normalizeFolderPath(path: string) {
    return path.trim().toLowerCase();
  }

  function getFolderDisplay(folder: MailFolder) {
    // 日本語コメント: IMAPの specialUse を最優先に評価し、サーバー実装差分で path 名が揺れても表示を安定させます。
    const normalizedPath = normalizeFolderPath(folder.path);
    const special = (folder.specialUse ?? '').toLowerCase();

    if (special === '\\inbox' || normalizedPath === 'inbox') {
      return { label: '受信トレイ', icon: 'i-lucide-inbox', protected: true };
    }
    if (special === '\\drafts' || normalizedPath.includes('draft')) {
      return {
        label: '下書き',
        icon: 'i-lucide-file-pen-line',
        protected: true,
      };
    }
    if (special === '\\sent' || normalizedPath.includes('sent')) {
      return { label: '送信済み', icon: 'i-lucide-send', protected: true };
    }
    if (
      special === '\\trash' ||
      normalizedPath.includes('trash') ||
      normalizedPath.includes('deleted')
    ) {
      return { label: 'ゴミ箱', icon: 'i-lucide-trash-2', protected: true };
    }
    if (normalizedPath.includes('spam') || normalizedPath.includes('junk')) {
      return {
        label: '迷惑メール',
        icon: 'i-lucide-shield-alert',
        protected: true,
      };
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

  const folderOptions = computed(() =>
    params.folders.value.map(folder => ({
      label: getFolderDisplay(folder).label,
      value: folder.path,
    }))
  );

  const activeFolder = computed(
    () =>
      params.folders.value.find(
        folder => folder.path === params.activeFolderPath.value
      ) ?? null
  );

  const currentFolder = computed(
    () =>
      params.folders.value.find(
        folder => folder.path === params.activeFolderPath.value
      ) ?? null
  );

  const canEditActiveFolder = computed(() => {
    // 日本語コメント: 重要フォルダの誤操作を防ぐため、保護フォルダは改名/削除を禁止します。
    if (!activeFolder.value) return false;
    return !getFolderDisplay(activeFolder.value).protected;
  });

  const isTrashFolder = computed(() => {
    const specialUse = currentFolder.value?.specialUse?.toLowerCase();
    if (specialUse === '\\trash') return true;

    const path = params.activeFolderPath.value.toLowerCase();
    return (
      path.includes('trash') ||
      path.includes('deleted') ||
      path.includes('ごみ箱')
    );
  });

  const isSentFolder = computed(() => {
    const specialUse = currentFolder.value?.specialUse?.toLowerCase();
    if (specialUse === '\\sent') return true;

    const path = params.activeFolderPath.value.toLowerCase();
    return path.includes('sent') || path.includes('送信済み');
  });

  const isDraftFolder = computed(() => {
    const specialUse = currentFolder.value?.specialUse?.toLowerCase();
    if (specialUse === '\\drafts') return true;

    const path = params.activeFolderPath.value.toLowerCase();
    return path.includes('draft') || path.includes('下書き');
  });

  const isSpamFolder = computed(() => {
    const path = params.activeFolderPath.value.toLowerCase();
    return (
      path.includes('spam') ||
      path.includes('junk') ||
      path.includes('迷惑メール')
    );
  });

  async function loadFolders() {
    if (!params.hasMailSetting.value) return;

    try {
      params.isLoading.value = true;

      const response = await mailApi.getMailboxes();
      params.setFolders(response.mailboxes);

      if (
        !response.mailboxes.some(
          folder => folder.path === params.activeFolderPath.value
        ) &&
        response.mailboxes.length > 0
      ) {
        // 日本語コメント: 現在フォルダが消えた/未一致の場合は先頭へ退避し、一覧表示不能状態を回避します。
        const firstFolder = response.mailboxes[0];
        if (firstFolder) {
          params.setActiveFolder(firstFolder.path);
        }
      }
    } catch (error) {
      toast.add({
        title: 'エラー',
        description:
          error instanceof Error ? error.message : 'フォルダ取得に失敗しました',
        color: 'error',
      });
    } finally {
      params.isLoading.value = false;
    }
  }

  async function onCreateFolder() {
    if (params.creatingFolder.value) return;

    const name = params.newFolderName.value.trim();
    if (!name) return;

    params.creatingFolder.value = true;
    try {
      const response = await mailApi.createFolder(name);
      params.setFolders(response.mailboxes);
      params.newFolderName.value = '';

      toast.add({
        title: '作成しました',
        description: 'フォルダを作成しました',
        color: 'success',
      });
    } catch (error) {
      toast.add({
        title: '作成失敗',
        description:
          error instanceof Error ? error.message : 'フォルダ作成に失敗しました',
        color: 'error',
      });
    } finally {
      params.creatingFolder.value = false;
    }
  }

  async function onRenameFolder() {
    if (
      !activeFolder.value ||
      !canEditActiveFolder.value ||
      params.folderActionLoading.value
    )
      return;

    const sourcePath = activeFolder.value.path;
    const nextName = window.prompt(
      '新しいフォルダ名を入力してください',
      activeFolder.value.name || sourcePath
    );
    if (!nextName || !nextName.trim()) return;

    params.folderActionLoading.value = true;
    try {
      const response = await mailApi.renameFolder(sourcePath, nextName.trim());
      params.setFolders(response.mailboxes);

      if (params.activeFolderPath.value === sourcePath) {
        params.setActiveFolder(nextName.trim());
      }

      toast.add({
        title: '変更しました',
        description: 'フォルダ名を変更しました',
        color: 'success',
      });
    } catch (error) {
      toast.add({
        title: '変更失敗',
        description:
          error instanceof Error
            ? error.message
            : 'フォルダ名の変更に失敗しました',
        color: 'error',
      });
    } finally {
      params.folderActionLoading.value = false;
    }
  }

  async function onDeleteFolder() {
    if (
      !activeFolder.value ||
      !canEditActiveFolder.value ||
      params.folderActionLoading.value
    )
      return;

    const targetPath = activeFolder.value.path;
    const targetName = activeFolder.value.name || targetPath;
    const confirmed = window.confirm(
      `フォルダ「${targetName}」を削除しますか？`
    );
    if (!confirmed) return;

    params.folderActionLoading.value = true;
    try {
      const response = await mailApi.deleteFolder(targetPath);
      params.setFolders(response.mailboxes);

      if (params.activeFolderPath.value === targetPath) {
        const first = response.mailboxes[0];
        if (first) {
          params.setActiveFolder(first.path);
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
        description:
          error instanceof Error ? error.message : 'フォルダ削除に失敗しました',
        color: 'error',
      });
    } finally {
      params.folderActionLoading.value = false;
    }
  }

  return {
    folderOptions,
    activeFolder,
    currentFolder,
    canEditActiveFolder,
    isTrashFolder,
    isSentFolder,
    isDraftFolder,
    isSpamFolder,
    getFolderDisplay,
    loadFolders,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
  };
}
