import prisma from '~~/lib/prisma';
import * as Sentry from '@sentry/nuxt';
import { logger } from '~~/server/utils/logger';
import { H3Event } from 'h3';
import { auth } from '~~/server/utils/auth';

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

    if (event) {
      const req = event.node.req;
      ipAddress =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      userAgent = req.headers['user-agent'];
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
        organizationId,
        targetId,
        ...details,
      },
    });

    // 3. ログ出力
    logger.info(
      {
        audit: true,
        userId,
        organizationId,
        action,
        targetId,
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
