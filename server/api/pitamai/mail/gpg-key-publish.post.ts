import { createError } from 'h3';
import prisma from '~~/lib/prisma';
import {
  requireMailAccountForUser,
  requireSessionUser,
} from '~~/server/utils/mail-account';
import { logAuditWithSession } from '~~/server/utils/audit';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);
  const account = await requireMailAccountForUser({ event });
  const preferredEmail = (account.username || account.emailAddress)
    .trim()
    .toLowerCase();

  const gpgKey = await prisma.userGpgKey.findUnique({
    where: { userId: user.id },
    select: {
      publicKey: true,
      fingerprint: true,
      email: true,
    },
  });

  if (!gpgKey) {
    throw createError({
      statusCode: 404,
      message:
        '公開するGPG鍵が見つかりません。先に鍵を作成またはインポートしてください。',
    });
  }

  const keyServerBaseUrl =
    process.env.PITAMAI_GPG_KEYSERVER_URL || 'https://keys.openpgp.org';

  const uploadUrl = `${keyServerBaseUrl.replace(/\/$/, '')}/vks/v1/upload`;

  const uploadAsJson = async () => {
    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
      body: JSON.stringify({
        keytext: gpgKey.publicKey,
      }),
    });
  };

  const uploadRaw = async (contentType: string) => {
    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
      body: gpgKey.publicKey,
    });
  };

  const uploadAsForm = async () => {
    const form = new URLSearchParams();
    form.set('keytext', gpgKey.publicKey);

    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
      body: form.toString(),
    });
  };

  let response: Response | null = null;
  let raw = '';
  try {
    const attempts: Array<() => Promise<Response>> = [
      () => uploadAsJson(),
      () => uploadRaw('application/pgp-keys'),
      () => uploadRaw('text/plain; charset=utf-8'),
      () => uploadAsForm(),
    ];

    for (const attempt of attempts) {
      response = await attempt();
      raw = await response.text();

      if (response.ok) {
        break;
      }

      logger.warn(
        {
          status: response.status,
          keyServer: keyServerBaseUrl,
          body: raw,
        },
        'GPG key publish attempt failed'
      );

      // 4xx/5xx でも他フォーマットで成功する場合があるため継続
    }
  } catch {
    throw createError({
      statusCode: 502,
      message:
        '公開鍵サーバーに接続できませんでした。時間をおいて再試行してください。',
    });
  }

  if (!response || !response.ok) {
    logger.warn(
      {
        status: response?.status,
        keyServer: keyServerBaseUrl,
        body: raw,
      },
      'GPG key publish failed'
    );

    throw createError({
      statusCode: 400,
      message:
        raw ||
        `公開鍵サーバーへの登録申請に失敗しました。(status=${response?.status ?? 'unknown'})`,
    });
  }

  type UploadResult = {
    token?: string;
    key_fpr?: string;
    status?: Record<
      string,
      'unpublished' | 'published' | 'revoked' | 'pending'
    >;
  };

  let uploadResult: UploadResult | null = null;
  try {
    uploadResult = JSON.parse(raw) as UploadResult;
  } catch {
    uploadResult = null;
  }

  const requestVerifyUrl = `${keyServerBaseUrl.replace(/\/$/, '')}/vks/v1/request-verify`;

  const statusMap = uploadResult?.status ?? {};
  const token = uploadResult?.token;

  const targetAddresses = Object.entries(statusMap)
    .filter(([email, status]) => {
      return status === 'unpublished' && email.toLowerCase() === preferredEmail;
    })
    .map(([email]) => email);

  const allStatusEmails = Object.keys(statusMap);
  const hasPreferredEmailInKey = allStatusEmails.some(
    email => email.toLowerCase() === preferredEmail
  );

  if (token && !hasPreferredEmailInKey) {
    throw createError({
      statusCode: 422,
      message: `この公開鍵にはメールアカウント(${preferredEmail})が含まれていません。鍵を再生成（または該当アドレス入りの鍵をインポート）してください。`,
    });
  }

  let verifyRaw = '';
  if (token && targetAddresses.length > 0) {
    let verifyResponse: Response;
    try {
      verifyResponse = await fetch(requestVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        },
        body: JSON.stringify({
          token,
          addresses: targetAddresses,
          locale: ['ja_JP', 'ja', 'en_US', 'en'],
        }),
      });
    } catch {
      throw createError({
        statusCode: 502,
        message:
          '公開鍵はアップロードされましたが、確認メール送信リクエストに失敗しました。時間をおいて再試行してください。',
      });
    }

    verifyRaw = await verifyResponse.text();

    if (!verifyResponse.ok) {
      logger.warn(
        {
          status: verifyResponse.status,
          keyServer: keyServerBaseUrl,
          body: verifyRaw,
        },
        'GPG key request-verify failed'
      );

      throw createError({
        statusCode: 400,
        message:
          verifyRaw ||
          `確認メール送信リクエストに失敗しました。(status=${verifyResponse.status})`,
      });
    }
  }

  try {
    await logAuditWithSession(event, {
      action: 'GPG_KEY_PUBLISH_REQUEST',
      targetId: user.id,
      details: {
        email: preferredEmail,
        fingerprint: gpgKey.fingerprint,
        keyServer: keyServerBaseUrl,
        status: 'requested',
        upload: uploadResult,
        verifyResponse: verifyRaw || null,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Audit logging failed for GPG key publish');
  }

  return {
    ok: true,
    message:
      targetAddresses.length > 0
        ? '公開鍵サーバーへ公開申請を送信しました。確認メールのリンクを開いて公開を完了してください。'
        : '公開鍵は既に公開済み、またはメールアカウント用アドレスが確認済みです。',
    keyServer: keyServerBaseUrl,
    fingerprint: gpgKey.fingerprint,
    uploadResponse: uploadResult ?? raw,
    requestVerifyResponse: verifyRaw || null,
    targetAddresses,
    preferredEmail,
  };
});
