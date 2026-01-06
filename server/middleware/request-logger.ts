import { logger } from '~~/server/utils/logger';

const getHeader = (
  headers: Record<string, string | string[] | undefined>,
  name: string
) => {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const getClientIp = (
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string
) => {
  const xff = getHeader(headers, 'x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return remoteAddress;
};

const getTraceId = (headers: Record<string, string | string[] | undefined>) => {
  const xCloudTrace = getHeader(headers, 'x-cloud-trace-context');
  if (xCloudTrace) {
    const traceId = xCloudTrace.split('/')[0]?.trim();
    if (traceId) return traceId;
  }
  const traceparent = getHeader(headers, 'traceparent');
  if (traceparent) {
    const parts = traceparent.split('-');
    const traceId = parts[1]?.trim();
    if (traceId) return traceId;
  }
  return undefined;
};

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

    const requestId =
      getHeader(req.headers as any, 'x-request-id') ||
      getHeader(req.headers as any, 'x-amzn-trace-id') ||
      getHeader(req.headers as any, 'cf-ray');
    const traceId = getTraceId(req.headers as any);
    const userAgent = getHeader(req.headers as any, 'user-agent');
    const remoteIp = getClientIp(req.headers as any, req.socket?.remoteAddress);

    const latencySeconds = `${(duration / 1000).toFixed(3)}s`;

    const httpRequest = {
      requestMethod: method,
      requestUrl: url,
      status: statusCode,
      userAgent,
      remoteIp,
      latency: latencySeconds,
    };

    const logData = {
      event: 'http_request',
      requestId,
      traceId,
      httpRequest,
      durationMs: duration,
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
