import { logger } from '~~/server/utils/logger';

export default defineEventHandler(event => {
  const { req, res } = event.node;
  const start = Date.now();
  const method = req.method;
  const url = req.url;

  // リクエスト開始ログ（必要であれば有効化、ノイズになる場合はコメントアウト）
  logger.debug({ method, url }, 'Incoming request');

  // レスポンス終了時のログ
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    const logData = {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
    };

    if (statusCode >= 500) {
      logger.error(logData, 'Request failed');
    } else if (statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else {
      logger.info(logData, 'Request completed');
    }
  });
});
