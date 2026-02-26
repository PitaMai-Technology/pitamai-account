/**
 * server/utils/mail-account.ts
 *
 * 認証・メールアカウント管理ユーティリティ
 *
 * メール関連の API エンドポイントが必要とするセッション認証と、
 * ユーザーに関連付けられたメールアカウント（IMAP/SMTP 接続情報）の取得を提供します。
 *
 * 主な役割：
 * - Better Auth セッションの検証
 * - セッションからユーザー ID 抽出
 * - ユーザーのメールアカウント情報の Prisma クエリ
 */

import { createError, type H3Event } from 'h3';
import prisma from '~~/lib/prisma';
import { auth } from '~~/server/utils/auth';

/**
 * H3 イベントから Better Auth セッションを取得し、認証済みユーザー情報を返します。
 *
 * 役割：
 * - event.headers から認証トークンを抽出
 * - Better Auth API へセッション照会
 * - 無効または期限切れセッションの場合、401 エラーを送出
 *
 * 戻り値:
 * - 認証済みユーザーオブジェクト（id, email, name など）
 *
 * エラー:
 * - 401: 認証失敗（トークン無効・期限切れ・未設定）
 */
export async function requireSessionUser(event: H3Event) {
  const session = await auth.api.getSession({ headers: event.headers });

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: '認証をしてください。',
    });
  }

  return session.user;
}

/**
 * H3 イベントから認証済みユーザーの ID を直接取得するコンビニエンス関数です。
 *
 * 役割：
 * - requireSessionUser() の戻り値 user.id を直接抽出
 * - ユーザー ID が必須の処理での簡潔な呼び出しを実現
 *
 * 戻り値:
 * - ユーザーの一意識別子（string）
 *
 * エラー:
 * - 401: 認証失敗（requireSessionUser に委譲）
 */
export async function requireSessionUserId(event: H3Event): Promise<string> {
  const user = await requireSessionUser(event);
  return user.id;
}

/**
 * 認証済みユーザーに紐付けられたメールアカウント情報を Prisma から取得します。
 *
 * 役割：
 * - セッション認証を実施（requireSessionUserId 呼び出し）
 * - ユーザーIDに基づいてメールアカウントをクエリ
 * - accountId がある場合、さらに絞り込み（複数アカウント対応）
 * - IMAP/SMTP 接続に必要な全情報（暗号化パスワード含む）を返却
 *
 * パラメータ:
 * - event: H3イベント（セッション検証用）
 * - accountId?: メールアカウントID（指定時はこの ID に限定）
 *
 * 戻り値:
 * - メールアカウントオブジェクト（id, userId, emailAddress, imapHost, encryptedPassword など）
 *
 * エラー:
 * - 401: 認証失敗（requireSessionUserId に委譲）
 * - 404: メールアカウントが見つからない（登録されていない場合）
 */
export async function requireMailAccountForUser(params: {
  event: H3Event;
  accountId?: string;
}) {
  // セッション検証とユーザー ID 抽出
  const userId = await requireSessionUserId(params.event);

  // ユーザーのメールアカウント情報を取得
  // accountId が指定されている場合はそのアカウントに限定、未指定の場合は該当ユーザーの最初のアカウントを取得
  const account = await prisma.mailAccount.findFirst({
    where: {
      // accountId が指定されていれば WHERE id = accountId、なければ省略（省略時は全アカウント対象）
      ...(params.accountId ? { id: params.accountId } : {}),
      // ユーザーの確認（他ユーザーのアカウント閲覧防止）
      userId,
    },
    // IMAP/SMTP 接続に必要なフィールドを厳選して返す（不要なフィールド除外）
    select: {
      id: true,
      userId: true,
      label: true,
      emailAddress: true,
      username: true,
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      // 暗号化されたパスワード（AES-256-GCM）と復号化用パラメータ
      encryptedPassword: true,
      encryptionIv: true,
      encryptionAuthTag: true,
      // メタデータ（時系列管理）
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!account) {
    throw createError({
      statusCode: 404,
      message: 'メールアカウントが見つかりません',
    });
  }

  // 検証済みのメールアカウント情報を返却
  // 呼び出し側で IMAP/SMTP 接続に使用
  return account;
}
