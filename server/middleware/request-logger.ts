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
  const isOauthConsent =
    method === 'POST' && url?.startsWith('/api/auth/oauth2/consent');

  // リクエスト開始ログ（必要であれば有効化、ノイズになる場合はコメントアウト）
  logger.debug({ method, url }, 'Incoming request');

  if (isOauthConsent) {
    const hasCookie = !!getHeader(req.headers as any, 'cookie');
    const origin = getHeader(req.headers as any, 'origin');
    const referer = getHeader(req.headers as any, 'referer');
    logger.info(
      {
        event: 'oauth_consent_request_start',
        method,
        url,
        hasCookie,
        origin,
        referer,
      },
      'OAuth consent request started'
    );
  }

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
      oauthConsent: isOauthConsent
        ? {
            hasCookie: !!getHeader(req.headers as any, 'cookie'),
            origin: getHeader(req.headers as any, 'origin'),
            referer: getHeader(req.headers as any, 'referer'),
          }
        : undefined,
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
