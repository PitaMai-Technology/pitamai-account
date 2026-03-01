/**
 * server/api/pitamai/mail/gpg-key.get.ts
 *
 * ログインユーザーの GPG 鍵情報を取得するエンドポイント。
 * 公開鍵と復号済み秘密鍵を返し、メールアドレスが変更された場合は
 * レコードも更新する。
 */
import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';
import { decryptGpgPrivateKey } from '~~/server/utils/mail-gpg';

export default defineEventHandler(async event => {
  // セッションユーザー確認
  const user = await requireSessionUser(event);

  // 優先メールアドレスを決定（アカウントの username かユーザーの email）
  const mailAccount = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
    select: {
      username: true,
    },
  });

  const preferredEmail = (mailAccount?.username || user.email || '').trim();

  // GPG 鍵レコードを取得
  const record = await prisma.userGpgKey.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      publicKey: true,
      fingerprint: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      encryptedPrivateKey: true,
      encryptionIv: true,
      encryptionAuthTag: true,
    },
  });

  if (!record) {
    return { hasKey: false, key: null };
  }

  // メールアドレスが現在の優先値と異なる場合は更新
  if (preferredEmail && record.email !== preferredEmail) {
    await prisma.userGpgKey.update({
      where: { id: record.id },
      data: { email: preferredEmail },
    });
  }

  // 秘密鍵を復号
  const armoredPrivateKey = await decryptGpgPrivateKey({
    ciphertext: record.encryptedPrivateKey,
    iv: record.encryptionIv,
    authTag: record.encryptionAuthTag,
  });

  return {
    hasKey: true,
    key: {
      id: record.id,
      publicKey: record.publicKey,
      privateKey: armoredPrivateKey,
      fingerprint: record.fingerprint,
      email: preferredEmail || record.email,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  };
});
