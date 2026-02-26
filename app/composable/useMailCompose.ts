import type { Ref } from 'vue';
import type {
  ComposeRecipientType,
  ComposeState,
  MailDetail,
} from '~/stores/mail';
import { useMailApi } from '~/composable/useMailApi';

/**
 * メール作成・下書き・送信ロジック
 *
 * 作成モーダルの状態管理とビジネスロジック、宛先フィールド管理、送受信処理を担う
 * コンポーザブル。
 *
 * @param {ComposeState} composeState - フォーム入力状態
 * @param {Ref<ComposeRecipientType>} recipientType - 現在選択中の宛先タイプ
 * @param {Ref<boolean>} composeOpen - モーダル開閉フラグ
 * @param {Ref<boolean>} sending - 送信中フラグ
 * @param {Ref<boolean>} draftSaving - 下書き保存中フラグ
 * @param {Ref<MailDetail|null>} currentMail - 編集中の下書きメール詳細
 * @param {() => void} resetComposeState - フォームのリセット関数
 */

type UseMailComposeParams = {
  composeState: ComposeState;
  recipientType: Ref<ComposeRecipientType>;
  composeOpen: Ref<boolean>;
  sending: Ref<boolean>;
  draftSaving: Ref<boolean>;
  currentMail: Ref<MailDetail | null>;
  resetComposeState: () => void;
};

export function useMailCompose(params: UseMailComposeParams) {
  const toast = useToast();
  const mailApi = useMailApi();

  const recipientTypeOptions = [
    { label: 'To', value: 'to' },
    { label: 'Cc', value: 'cc' },
    { label: 'Bcc', value: 'bcc' },
  ];

  // CC フィールドを追加（最低1行は常に維持）
  function addCcField() {
    params.composeState.ccList.push('');
  }

  // 指定インデックスの CC フィールドを削除
  function removeCcField(index: number) {
    if (params.composeState.ccList.length <= 1) {
      params.composeState.ccList[0] = '';
      return;
    }
    params.composeState.ccList.splice(index, 1);
  }

  // BCC フィールドを追加
  function addBccField() {
    params.composeState.bccList.push('');
  }

  // 指定インデックスの BCC フィールドを削除
  function removeBccField(index: number) {
    if (params.composeState.bccList.length <= 1) {
      params.composeState.bccList[0] = '';
      return;
    }
    params.composeState.bccList.splice(index, 1);
  }

  /**
   * カンマ区切り文字列を配列に変換。空文字列は [''] を返す。
   * 下書き時にフィールド数を保持するためのユーティリティ。
   */
  function splitRecipientList(value: string | null) {
    // 日本語コメント: 下書き復元時に空入力でもUIを壊さないため、最低1行を維持します。
    if (!value) return [''];

    const items = value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);

    return items.length > 0 ? items : [''];
  }

  // 下書きを編集モードで開く
  function onUseDraftForCompose() {
    if (!params.currentMail.value) return;

    // 下書き再編集時は宛先/件名/本文を一括復元し、送信モーダルへ確実に引き継ぎます。
    params.composeState.to = params.currentMail.value.to ?? '';
    params.composeState.ccList = splitRecipientList(
      params.currentMail.value.cc
    );
    params.composeState.bccList = splitRecipientList(
      params.currentMail.value.bcc
    );
    params.composeState.subject = params.currentMail.value.subject ?? '';
    params.composeState.text = params.currentMail.value.text ?? '';
    params.recipientType.value = 'to';
    params.composeOpen.value = true;
  }

  /**
   * File を base64 文字列に変換するユーティリティ
   * @param file - 読み込み対象ファイル
   * @returns Promise<string> base64 (先頭データURL部分除去)
   */
  async function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64 || '');
      };
      reader.onerror = () =>
        reject(new Error('添付ファイルの読み込みに失敗しました'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * メール送信処理。
   * - 宛先検証
   * - 添付ファイル base64 変換
   * - API 呼び出し
   * - 成功/失敗トースト表示
   */
  async function onSendMail() {
    if (params.sending.value) return;

    const to = params.composeState.to.trim();
    const cc = params.composeState.ccList
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .join(',');
    const bcc = params.composeState.bccList
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .join(',');

    if (!to && !cc && !bcc) {
      // 日本語コメント: 宛先未設定送信をここで遮断し、サーバーエラーになる前に利用者へ即時フィードバックします。
      toast.add({
        title: '入力エラー',
        description: 'To/Cc/Bcc のいずれかを入力してください',
        color: 'error',
      });
      return;
    }

    params.sending.value = true;
    try {
      const attachments = await Promise.all(
        params.composeState.files.map(async file => ({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: await toBase64(file),
        }))
      );

      const sendResult = await mailApi.sendMail({
        to: to || undefined,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: params.composeState.subject,
        text: params.composeState.text,
        sign: params.composeState.sign,
        encrypt: params.composeState.encrypt,
        attachments,
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

      params.resetComposeState();
      // 送信完了後は誤再送を防ぐため入力状態をリセットしてモーダルを閉じます。
      params.composeOpen.value = false;
    } catch (error) {
      toast.add({
        title: '送信失敗',
        description:
          error instanceof Error ? error.message : 'メール送信に失敗しました',
        color: 'error',
      });
    } finally {
      params.sending.value = false;
    }
  }

  /**
   * 下書き保存処理。同様にファイルを base64 変換し、API を呼ぶ。
   */
  async function onSaveDraft() {
    if (params.draftSaving.value) return;

    const to = params.composeState.to.trim();
    const cc = params.composeState.ccList
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .join(',');
    const bcc = params.composeState.bccList
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .join(',');

    params.draftSaving.value = true;
    try {
      const attachments = await Promise.all(
        params.composeState.files.map(async file => ({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: await toBase64(file),
        }))
      );

      const result = await mailApi.saveDraft({
        to: to || undefined,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: params.composeState.subject,
        text: params.composeState.text,
        attachments,
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
        description:
          error instanceof Error ? error.message : '下書き保存に失敗しました',
        color: 'error',
      });
    } finally {
      params.draftSaving.value = false;
    }
  }

  return {
    recipientTypeOptions,
    addCcField,
    removeCcField,
    addBccField,
    removeBccField,
    onUseDraftForCompose,
    onSendMail,
    onSaveDraft,
  };
}
