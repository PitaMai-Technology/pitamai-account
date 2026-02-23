import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';
import { simpleParser } from 'mailparser';
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
      html: null,
      hasAttachments: false,
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
      html: null,
      hasAttachments: false,
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

    // 復号結果を MIME として再解析し、本文・HTML・添付を分離
    let finalText = decryptedText;
    let finalHtml: string | null = null;
    let hasAttachments = false;

    try {
      const decryptedMimeBuffer = Buffer.from(decryptedText, 'utf8');
      const mimeAnalysis = await simpleParser(decryptedMimeBuffer);

      finalText = mimeAnalysis.text ?? decryptedText;
      finalHtml =
        typeof mimeAnalysis.html === 'string' ? mimeAnalysis.html : null;
      hasAttachments = (mimeAnalysis.attachments?.length ?? 0) > 0;
    } catch {
      // MIME 解析失敗は無視、元の decryptedText を使用
    }

    return {
      decrypted: true,
      text: finalText,
      html: finalHtml,
      hasAttachments,
    };
  } catch (e) {
    return {
      decrypted: false,
      reason: e instanceof Error ? e.message : '復号に失敗しました',
      text: parsed.data.text,
      html: null,
      hasAttachments: false,
    };
  }
});
