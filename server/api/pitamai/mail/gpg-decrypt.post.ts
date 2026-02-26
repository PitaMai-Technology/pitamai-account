/**
 * server/api/pitamai/mail/gpg-decrypt.post.ts
 *
 * PGP 暗号化されたメッセージを受け取り、ユーザーの秘密鍵で復号する API。
 * 成功すればプレーンテキストと HTML/添付情報を返し、失敗や非暗号文の場合は理由付きで応答。
 */
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

// リクエストボディスキーマ: 復号対象テキストを含む
const bodySchema = z.object({
  text: z.string().min(1),
});

export default defineEventHandler(async event => {
  // セッションユーザー取得
  const user = await requireSessionUser(event);
  const body = await readBody(event);

  // バリデーション
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  // PGP 暗号化テキストか確認
  if (!isPgpEncryptedText(parsed.data.text)) {
    return {
      decrypted: false,
      reason: 'PGP 暗号化メッセージではありません',
      text: parsed.data.text,
      html: null,
      hasAttachments: false,
    };
  }

  // ユーザー秘密鍵記録を取得
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
    // 秘密鍵復号
    const armoredPrivateKey = decryptGpgPrivateKey({
      ciphertext: gpgRecord.encryptedPrivateKey,
      iv: gpgRecord.encryptionIv,
      authTag: gpgRecord.encryptionAuthTag,
    });

    // メッセージ本体復号
    const decryptedText = await decryptEncryptedMessage({
      armoredMessage: parsed.data.text,
      armoredPrivateKey,
    });

    // 復号テキストを MIME 解析してテキスト/HTML/添付有無を抽出
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
      // MIME 解析失敗時はそのまま続行
    }

    return {
      decrypted: true,
      text: finalText,
      html: finalHtml,
      hasAttachments,
    };
  } catch (e) {
    // 復号エラーの戻り値
    return {
      decrypted: false,
      reason: e instanceof Error ? e.message : '復号に失敗しました',
      text: parsed.data.text,
      html: null,
      hasAttachments: false,
    };
  }
});
