import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';
import {
  decryptEncryptedMessage,
  decryptGpgPrivateKey,
  isPgpEncryptedText,
} from '~~/server/utils/mail-gpg';

const bodySchema = z.object({
  text: z.string().min(1),
});

export default defineEventHandler(async event => {
  const user = await requireSessionUser(event);
  const body = await readBody(event);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  if (!isPgpEncryptedText(parsed.data.text)) {
    return {
      decrypted: false,
      reason: 'PGP 暗号化メッセージではありません',
      text: parsed.data.text,
    };
  }

  const gpgRecord = await prisma.userGpgKey.findUnique({
    where: { userId: user.id },
    select: {
      encryptedPrivateKey: true,
      encryptionIv: true,
      encryptionAuthTag: true,
    },
  });

  if (!gpgRecord) {
    return {
      decrypted: false,
      reason: '秘密鍵が登録されていないため復号できません',
      text: parsed.data.text,
    };
  }

  try {
    const armoredPrivateKey = decryptGpgPrivateKey({
      ciphertext: gpgRecord.encryptedPrivateKey,
      iv: gpgRecord.encryptionIv,
      authTag: gpgRecord.encryptionAuthTag,
    });

    const decryptedText = await decryptEncryptedMessage({
      armoredMessage: parsed.data.text,
      armoredPrivateKey,
    });

    return {
      decrypted: true,
      text: decryptedText,
    };
  } catch (e) {
    return {
      decrypted: false,
      reason: e instanceof Error ? e.message : '復号に失敗しました',
      text: parsed.data.text,
    };
  }
});
