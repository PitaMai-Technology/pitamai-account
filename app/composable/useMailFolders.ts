import type { Ref } from 'vue';
import type { MailFolder } from '~/stores/mail';
import { useMailApi } from '~/composable/useMailApi';

/**
 * IMAP フォルダ管理と表示制御コンポーザブル
 *
 * サーバーからフォルダ一覧を取得し Vue の反応性ステートへ格納、
 * フォルダの作成・名称変更・削除などの CRUD 操作を実装します。
 * 保護フォルダ判定機能により重要フォルダの編集を制限します。
 *
 * @param {Ref<boolean>} hasMailSetting - メール設定の有無
 * @param {Ref<string>} activeFolderPath - 現在アクティブなフォルダパス
 * @param {Ref<MailFolder[]>} folders - 現在のフォルダ一覧
 * @param {Ref<boolean>} isLoading - フォルダ読み込み中フラグ
 * @param {Ref<boolean>} creatingFolder - フォルダ作成中フラグ
 * @param {Ref<boolean>} folderActionLoading - 編集操作中フラグ
 * @param {Ref<string>} newFolderName - 新規フォルダ名入力文字列
 * @param {(items: MailFolder[]) => void} setFolders - フォルダ一覧更新関数
 * @param {(path: string) => void} setActiveFolder - アクティブフォルダ設定関数
 */
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

  // フォルダパスを比較しやすく正規化
  function normalizeFolderPath(path: string) {
    return path.trim().toLowerCase();
  }

  /**
   * フォルダオブジェクトを human-readable な表示情報に変換
   * @param {MailFolder} folder
   * @returns {{label:string,icon:string,protected:boolean}}
   */
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

  // フォルダ一覧を API から読み込み、状態を更新
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
