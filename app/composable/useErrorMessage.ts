/**
 * useErrorMessage.ts
 *
 * 役割:
 * API レスポンスエラーから人間が読みやすいメッセージを抽出する
 * サーバーが `message` フィールドを返しているなら優先、なければステータスコードで推測
 *
 * 使い方:
 * ============================================================
 * import { useErrorMessage } from '~/composable/useErrorMessage';
 *
 * const { getErrorMessage } = useErrorMessage();
 *
 * // try-catch でのエラーハンドリング
 * try {
 *   await someApiCall();
 * } catch (error) {
 *   const msg = getErrorMessage(error, 'デフォルトエラーメッセージ');
 *   toast.add({
 *     title: 'エラー',
 *     description: msg,
 *     color: 'error',
 *   });
 * }
 *
 * // HTTPエラーの場合（FetchError等）
 * const errorMsg = getErrorMessage(error, 'API呼び出し失敗');
 * // 例:
 * // - サーバーが返した message なら: "ユーザーが見つかりません"
 * // - 404 なら: "リソースが見つかりません (404)"
 * // - 500 なら: "サーバーエラーが発生しました (500)"
 * // - 不明なエラーなら: 指定した defaultMessage
 * ============================================================
 */

export function useErrorMessage() {
  /**
   * エラーオブジェクトからメッセージを取得
   *
   * @param error - キャッチしたエラーオブジェクト
   * @param defaultMessage - エラーメッセージが取れない場合の代替テキスト
   * @returns 表示用のエラーメッセージ文字列
   */
  function getErrorMessage(error: unknown, defaultMessage: string): string {
    // エラーオブジェクトではない場合
    if (!error || typeof error !== 'object') {
      return defaultMessage;
    }

    const maybeError = error as {
      data?: { message?: string };
      message?: string;
      status?: number;
      statusCode?: number;
    };

    // サーバーが返した message を優先
    if (
      typeof maybeError.data?.message === 'string' &&
      maybeError.data.message.trim()
    ) {
      return maybeError.data.message;
    }

    // エラーオブジェクト自体に message フィールドがある場合
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return maybeError.message;
    }

    // ステータスコードから推測
    const statusCode = maybeError.status ?? maybeError.statusCode;
    if (typeof statusCode === 'number') {
      switch (statusCode) {
        case 400:
          return 'リクエストが不正です (400)';
        case 401:
          return '認証に失敗しました (401)';
        case 403:
          return 'アクセス権限がありません (403)';
        case 404:
          return 'リソースが見つかりません (404)';
        case 409:
          return 'リソースの競合が発生しました (409)';
        case 422:
          return 'リクエストの検証に失敗しました (422)';
        case 429:
          return 'リクエスト制限に達しました (429)';
        case 500:
          return 'サーバーエラーが発生しました (500)';
        case 502:
          return 'ゲートウェイエラーが発生しました (502)';
        case 503:
          return 'サーバーが利用不可です (503)';
        default:
          return `エラーが発生しました (${statusCode})`;
      }
    }

    // それでもダメなら defaultMessage を返す
    return defaultMessage;
  }

  return {
    getErrorMessage,
  };
}
