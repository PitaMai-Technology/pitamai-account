import type { Ref } from 'vue';
import type { MailDetail } from '~/stores/mail';
import { useMailApi } from '~/composable/useMailApi';

type MoveDestination = 'trash' | 'archive' | 'inbox';

type UseMailActionsParams = {
  activeFolderPath: Ref<string>;
  selectedUid: Ref<number | null>;
  currentMail: Ref<MailDetail | null>;
  hasSelectedMail: Ref<boolean>;
  isSpamFolder: Ref<boolean>;
  resolveDropTargetUids: (dragStartUid: number) => number[];
  resetSelectionAfterDrop: () => void;
  clearMailDataCache: () => void;
  confirm: (message: string) => Promise<boolean>;
  loadMessages: (options?: {
    markOpenedAsRead?: boolean;
    notifyIfNew?: boolean;
    forceSync?: boolean;
  }) => Promise<void>;
};

export function useMailActions(params: UseMailActionsParams) {
  const toast = useToast();
  const serverError = useError();
  const mailApi = useMailApi();

  async function onDropMailToFolder(
    droppedUids: number[],
    toFolderPath: string
  ) {
    if (!params.activeFolderPath.value) return;
    if (params.activeFolderPath.value === toFolderPath) return;
    const fromFolderPath = params.activeFolderPath.value;

    const targetUids =
      droppedUids.length > 0
        ? Array.from(new Set(droppedUids))
        : params.resolveDropTargetUids(params.selectedUid.value ?? 0);

    if (targetUids.length === 0) {
      return;
    }

    if (targetUids.length > 1) {
      const confirmed = await params.confirm(
        `${targetUids.length}件のメールを「${toFolderPath}」へ移動しますか？`
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      for (const targetUid of targetUids) {
        await mailApi.moveToFolder(targetUid, fromFolderPath, toFolderPath);
      }

      params.clearMailDataCache();

      toast.add({
        title: '移動しました',
        description:
          targetUids.length > 1
            ? `${targetUids.length}件のメールをフォルダへ移動しました`
            : 'メールをフォルダへ移動しました',
        color: 'success',
      });

      await params.loadMessages({
        markOpenedAsRead: false,
        notifyIfNew: false,
        forceSync: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー';
      toast.add({
        title: '移動失敗',
        description: `${message} メール移動に失敗しました`,
        color: 'error',
      });
    } finally {
      params.resetSelectionAfterDrop();
    }
  }

  async function onMove(destination: MoveDestination) {
    if (!params.hasSelectedMail.value) return;

    const uid = params.selectedUid.value;
    if (uid === null) return;

    try {
      await mailApi.moveMessage(
        params.activeFolderPath.value,
        uid,
        destination
      );

      params.clearMailDataCache();

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

      await params.loadMessages({ forceSync: true });
    } catch (error) {
      const defaultMsg =
        destination === 'trash'
          ? '削除に失敗しました'
          : destination === 'archive'
            ? 'アーカイブに失敗しました'
            : '復元に失敗しました';

      toast.add({
        title: 'エラー',
        description: `${error instanceof Error ? error.message : '不明なエラー'} ${defaultMsg}`,
        color: 'error',
      });
    }
  }

  async function onOpenAttachment(index: number) {
    const activeMail = params.currentMail.value;
    if (!activeMail) return;
    const folderPath = params.activeFolderPath.value;

    if (params.isSpamFolder.value) {
      toast.add({
        title: 'ブロックしました',
        description: '迷惑メールでは添付ファイルを開けません。',
        color: 'warning',
      });
      return;
    }

    const attachment = activeMail.attachments[index];
    if (!attachment) return;

    const confirmed = await params.confirm(
      `添付ファイル「${attachment.filename ?? '名前なし'}」を開きますか？`
    );

    if (!confirmed) return;

    const uid = activeMail.uid;

    const url = `/api/pitamai/mail/attachment?folder=${encodeURIComponent(folderPath)}&uid=${uid}&index=${index}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return {
    onDropMailToFolder,
    onMove,
    onOpenAttachment,
  };
}
