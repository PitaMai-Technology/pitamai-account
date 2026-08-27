import * as Sentry from '@sentry/nuxt';

type ErrorRecord = Record<string, unknown>;

function asErrorRecord(error: unknown): ErrorRecord {
  return typeof error === 'object' && error !== null ? error : {};
}

/**
 * クライアントで処理済みのエラーをSentryへ送る。
 *
 * Better Authは失敗時に例外ではなく `{ error }` を返す場合があるため、
 * Vueのグローバルエラーハンドラーだけでは拾えない。画面側でこの関数を呼び、
 * 利用者には固定文言だけを表示する。
 *
 * @example
 * ```ts
 * if (error) {
 *   captureClientError(error, 'passkey.add')
 *   toast.add({ description: '処理を完了できませんでした。' })
 * }
 * ```
 *
 * 入力値やAPIレスポンス全体はSentryへ渡さない。
 * メールアドレス、OTP、公開鍵、Credential IDなどを誤って記録しないため、
 * 診断に必要な操作名・エラーコード・HTTPステータスだけをタグへ保存する。
 */
export function captureClientError(error: unknown, operation: string) {
  const record = asErrorRecord(error);
  let message = 'Unknown client error';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof record.message === 'string') {
    message = record.message;
  }
  const capturedError = error instanceof Error ? error : new Error(message);

  Sentry.withScope(scope => {
    scope.setTag('client.operation', operation);

    if (typeof record.code === 'string') {
      scope.setTag('client.error_code', record.code);
    }
    if (typeof record.status === 'number') {
      scope.setTag('http.status_code', String(record.status));
    }

    Sentry.captureException(capturedError);
  });
}
