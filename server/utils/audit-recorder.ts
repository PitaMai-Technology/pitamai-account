import * as Sentry from '@sentry/nuxt';
import type { H3Event } from 'h3';
import type { Prisma } from '@prisma/client';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';

/**
 * 監査ログの保存処理だけを担当する低レベルのユーティリティ。
 *
 * Nuxt API からは `event`、Better Auth の hook からは `request` を渡せる。
 * どちらから呼んでも、IP・User-Agent・リクエスト ID を同じ形式で保存する。
 *
 * Nuxt API での使用例:
 *
 * @example
 * ```ts
 * await recordAuditLog({
 *   userId: session.user.id,
 *   action: 'REPORT_EXPORT',
 *   targetId: reportId,
 *   details: { format: 'csv' },
 *   event,
 * })
 * ```
 *
 * Better Auth hook での使用例:
 *
 * @example
 * ```ts
 * await recordAuditLog({
 *   userId: session.user.id,
 *   action: 'ORGANIZATION_UPDATE',
 *   request: ctx.request,
 * })
 * ```
 *
 * 実行ユーザーの取得や権限確認はここでは行わない。呼び出し元で済ませてから渡す。
 */

const getEventHeader = (event: H3Event, name: string) => {
  const raw = event.node.req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
};

const getRequestHeader = (
  event: H3Event | undefined,
  request: Request | undefined,
  name: string
) =>
  event
    ? getEventHeader(event, name)
    : (request?.headers.get(name) ?? undefined);

const getClientIp = (event?: H3Event, request?: Request) => {
  // x-forwarded-for は複数 IP が入るため、最初の値だけを使う。
  // 本番では信頼できるリバースプロキシがこのヘッダーを上書きする前提。
  const forwardedFor = getRequestHeader(event, request, 'x-forwarded-for');
  const forwardedIp = forwardedFor?.split(',')[0]?.trim();

  return (
    forwardedIp ||
    getRequestHeader(event, request, 'cf-connecting-ip') ||
    event?.node.req.socket.remoteAddress
  );
};

const getTraceId = (event?: H3Event, request?: Request) => {
  // Google Cloud と W3C traceparent の両方に対応しておく。
  // Sentry や構造化ログと照合するときに、この値を検索キーとして使える。
  const cloudTrace = getRequestHeader(event, request, 'x-cloud-trace-context');
  const cloudTraceId = cloudTrace?.split('/')[0]?.trim();
  if (cloudTraceId) return cloudTraceId;

  return getRequestHeader(event, request, 'traceparent')?.split('-')[1]?.trim();
};

export interface AuditLogParams {
  /** 操作したユーザー。バッチなどシステム処理の場合は省略できる。 */
  userId?: string;
  /** 操作対象の組織。組織に属さない操作では省略する。 */
  organizationId?: string;
  /** 検索しやすい固定文字列。画面表示用の文章は入れない。 */
  action: string;
  /** 操作対象の user/member/client などの ID。 */
  targetId?: string;
  /** action 固有の補助情報。パスワードやトークンは絶対に含めない。 */
  details?: Record<string, unknown>;
  /** Nuxt/H3 の API ルートから呼ぶ場合に渡す。 */
  event?: H3Event;
  /** Better Auth の hook から呼ぶ場合に渡す。 */
  request?: Request;
}

export const recordAuditLog = async (params: AuditLogParams) => {
  const { userId, organizationId, action, targetId, details, event, request } =
    params;

  try {
    const ipAddress = getClientIp(event, request);
    const userAgent = getRequestHeader(event, request, 'user-agent');
    const requestId =
      getRequestHeader(event, request, 'x-request-id') ||
      getRequestHeader(event, request, 'x-amzn-trace-id') ||
      getRequestHeader(event, request, 'cf-ray');
    const traceId = getTraceId(event, request);
    const method = event?.node.req.method ?? request?.method;
    const url = event?.node.req.url ?? request?.url;

    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action,
        targetId,
        details: details ? (details as Prisma.InputJsonValue) : undefined,
        ipAddress,
        userAgent,
      },
    });

    Sentry.addBreadcrumb({
      category: 'audit',
      message: `${action} by ${userId || 'system'}`,
      level: 'info',
      data: {
        audit: { userId, organizationId, action, targetId, details },
        request: { requestId, traceId, method, url },
      },
    });

    logger.info(
      {
        event: 'audit',
        requestId,
        traceId,
        audit: { userId, organizationId, action, targetId, details },
        httpRequest:
          method || url
            ? {
                requestMethod: method,
                requestUrl: url,
                userAgent,
                remoteIp: ipAddress,
              }
            : undefined,
      },
      `Audit Log: ${action}`
    );
  } catch (error) {
    // 監査 DB の一時障害で、ログインや管理操作そのものまで失敗させない方針。
    // 保存に失敗した事実は通常ログと Sentry の両方へ送る。
    logger.error(error, 'Failed to record audit log');
    Sentry.captureException(error);
  }
};
