import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import {
  requireMailAccountForUser,
  requireSessionUser,
} from '~~/server/utils/mail-account';
import {
  generateGpgKeyPair,
  encryptGpgPrivateKey,
} from '~~/server/utils/mail-gpg';
import * as openpgp from 'openpgp';

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate'),
    name: z.string().min(1),
  }),
  z.object({
    action: z.literal('import'),
    publicKey: z.string().min(1),
    privateKey: z.string().min(1),
  }),
]);

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);
  const account = await requireMailAccountForUser({ event });
  const gpgIdentityEmail = account.username.trim();
  const body = await readBody(event);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: '形式(バリデーション)が違います',
    });
  }

  let publicKey: string;
  let privateKey: string;
  let fingerprint: string;

  if (parsed.data.action === 'generate') {
    const kp = await generateGpgKeyPair({
      name: parsed.data.name,
      email: gpgIdentityEmail,
    });
    publicKey = kp.publicKey;
    privateKey = kp.privateKey;
    fingerprint = kp.fingerprint;
  } else {
    // インポート: 公開鍵からフィンガープリントを取得
    try {
      const pubKey = await openpgp.readKey({
        armoredKey: parsed.data.publicKey,
      });
      fingerprint = pubKey.getFingerprint().toUpperCase();
    } catch {
      throw createError({
        statusCode: 422,
        message: '公開鍵の形式が正しくありません',
      });
    }

    try {
      await openpgp.readPrivateKey({ armoredKey: parsed.data.privateKey });
    } catch {
      throw createError({
        statusCode: 422,
        message: '秘密鍵の形式が正しくありません',
      });
    }

    publicKey = parsed.data.publicKey;
    privateKey = parsed.data.privateKey;
  }

  const encrypted = encryptGpgPrivateKey(privateKey);

  const record = await prisma.userGpgKey.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      publicKey,
      encryptedPrivateKey: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      fingerprint,
      email: gpgIdentityEmail,
    },
    update: {
      publicKey,
      encryptedPrivateKey: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      fingerprint,
      email: gpgIdentityEmail,
    },
    select: {
      id: true,
      fingerprint: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { ok: true, key: record };
});
