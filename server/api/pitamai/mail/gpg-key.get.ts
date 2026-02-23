import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';
import { decryptGpgPrivateKey } from '~~/server/utils/mail-gpg';

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);

  const mailAccount = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
    select: {
      username: true,
    },
  });

  const preferredEmail = (mailAccount?.username || user.email || '').trim();

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

  if (preferredEmail && record.email !== preferredEmail) {
    await prisma.userGpgKey.update({
      where: { id: record.id },
      data: { email: preferredEmail },
    });
  }

  const armoredPrivateKey = decryptGpgPrivateKey({
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
