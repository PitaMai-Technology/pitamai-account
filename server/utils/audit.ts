import prisma from '~~/lib/prisma';
import * as Sentry from '@sentry/nuxt';
import { logger } from '~~/server/utils/logger';
import { H3Event } from 'h3';
import { auth } from '~~/server/utils/auth';

const getHeader = (event: H3Event, name: string) => {
  const raw = event.node.req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
};

const getClientIp = (event: H3Event) => {
  const xff = getHeader(event, 'x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return event.node.req.socket.remoteAddress;
};

const getTraceId = (event: H3Event) => {
  const xCloudTrace = getHeader(event, 'x-cloud-trace-context');
  if (xCloudTrace) {
    const traceId = xCloudTrace.split('/')[0]?.trim();
    if (traceId) return traceId;
  }
  const traceparent = getHeader(event, 'traceparent');
  if (traceparent) {
    const parts = traceparent.split('-');
    const traceId = parts[1]?.trim();
    if (traceId) return traceId;
  }
  return undefined;
};

interface AuditLogParams {
  userId?: string;
  organizationId?: string;
  action: string;
  targetId?: string;
  details?: Record<string, unknown>;
  event?: H3Event; // IPアドレス取得用
}

/**
 * 監査ログを記録する
 * DBへの保存とSentryへのBreadcrumb追加を行う
 */
export const recordAuditLog = async (params: AuditLogParams) => {
  const { userId, organizationId, action, targetId, details, event } = params;

  try {
    // IPアドレスとUserAgentの取得
    let ipAddress: string | undefined;
    let userAgent: string | undefined;
    let requestId: string | undefined;
    let traceId: string | undefined;
    let method: string | undefined;
    let url: string | undefined;

    if (event) {
      ipAddress = getClientIp(event);
      userAgent = getHeader(event, 'user-agent');
      requestId =
        getHeader(event, 'x-request-id') ||
        getHeader(event, 'x-amzn-trace-id') ||
        getHeader(event, 'cf-ray');
      traceId = getTraceId(event);
      method = event.node.req.method;
      url = event.node.req.url;
    }

    // 1. DBに保存
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action,
        targetId,
        details: details ? (details as any) : undefined,
        ipAddress,
        userAgent,
      },
    });

    // 2. SentryにBreadcrumbを追加 (エラー時の調査用)
    Sentry.addBreadcrumb({
      category: 'audit',
      message: `${action} by ${userId || 'system'}`,
      level: 'info',
      data: {
        audit: {
          userId,
          organizationId,
          action,
          targetId,
          details,
        },
        request: {
          requestId,
          traceId,
          method,
          url,
        },
      },
    });

    // 3. ログ出力
    logger.info(
      {
        event: 'audit',
        requestId,
        traceId,
        audit: {
          userId,
          organizationId,
          action,
          targetId,
          details,
        },
        httpRequest:
          event && (method || url)
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
  } catch (e) {
    // 監査ログの保存失敗がメイン処理を止めるべきではないが、
    // 監査要件が厳しい場合はここでthrowすることもある。
    // 今回はエラーログを出してスルーする。
    logger.error(e, 'Failed to record audit log');
    Sentry.captureException(e);
  }
};

export const logAuditWithSession = async (
  event: H3Event,
  params: {
    action: string;
    targetId?: string;
    organizationId?: string;
    details?: Record<string, unknown>;
  }
) => {
  const session = await auth.api.getSession({ headers: event.headers });
  if (!session?.user) return;

  await recordAuditLog({
    userId: session.user.id,
    action: params.action,
    targetId: params.targetId,
    organizationId: params.organizationId,
    details: params.details,
    event,
  });
};
