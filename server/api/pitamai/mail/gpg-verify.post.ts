/**
 * server/api/pitamai/mail/gpg-verify.post.ts
 *
 * 受信したテキストが PGP 署名されているかを検証するエンドポイント。
 * inline/脱署名付き/脱署名バイナリ形式に対応し、ローカルDB または
 * キーサーバーから公開鍵を取得して検証を行う。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { requireSessionUser } from '~~/server/utils/mail-account';
import {
  verifySignedMessage,
  verifyDetachedSignedMessage,
  verifyDetachedSignedBinaryMessage,
  isPgpSignedText,
  fetchPublicKeyFromKeyServer,
} from '~~/server/utils/mail-gpg';

// リクエストボディのスキーマ
const bodySchema = z.object({
  text: z.string().min(1),
  senderEmail: z.string().email(),
  useOwnKey: z.boolean().optional().default(false),
  detachedSignature: z.string().optional(),
  detachedSignedDataBase64: z.string().optional(),
});

export default defineEventHandler(async event => {
  // セッションユーザー取得
  const user = await requireSessionUser(event);

  const body = await readBody(event);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    throw createError({ statusCode: 422, message: 'Validation Error' });
  }

  // インライン署名か脱署名かを判定
  const isInlineSigned = isPgpSignedText(parsed.data.text);
  const hasDetachedSignature =
    typeof parsed.data.detachedSignature === 'string' &&
    parsed.data.detachedSignature.includes('-----BEGIN PGP SIGNATURE-----');

  if (!isInlineSigned && !hasDetachedSignature) {
    return { verified: false, reason: 'PGP 署名が含まれていません' };
  }

  // 署名鍵選択ロジック
  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  let gpgRecord: {
    publicKey: string;
    fingerprint?: string;
    email?: string;
  } | null = null;

  if (parsed.data.useOwnKey) {
    // 自分の鍵を優先
    gpgRecord = await prisma.userGpgKey.findUnique({
      where: { userId: user.id },
      select: { publicKey: true, fingerprint: true, email: true },
    });
  } else {
    const targetEmail = normalizeEmail(parsed.data.senderEmail);
    const records = await prisma.userGpgKey.findMany({
      select: { publicKey: true, fingerprint: true, email: true },
    });

    gpgRecord =
      records.find(record => normalizeEmail(record.email) === targetEmail) ??
      null;

    // ローカルに無ければキーサーバーから取得
    if (!gpgRecord) {
      const keyFromServer = await fetchPublicKeyFromKeyServer(targetEmail);
      if (keyFromServer) {
        gpgRecord = {
          publicKey: keyFromServer,
          email: targetEmail,
        };
      }
    }
  }

  if (!gpgRecord) {
    return {
      verified: false,
      reason: parsed.data.useOwnKey
        ? '現在ログイン中ユーザーの公開鍵が登録されていないため検証できません'
        : `${parsed.data.senderEmail} の公開鍵がローカルシステムまたはキーサーバーに見つからないため検証できません`,
    };
  }

  // 実際の署名検証
  const result = isInlineSigned
    ? await verifySignedMessage({
        signedText: parsed.data.text,
        armoredPublicKey: gpgRecord.publicKey,
      })
    : parsed.data.detachedSignedDataBase64
      ? await verifyDetachedSignedBinaryMessage({
          binaryData: Buffer.from(
            parsed.data.detachedSignedDataBase64,
            'base64'
          ),
          armoredSignature: parsed.data.detachedSignature!,
          armoredPublicKey: gpgRecord.publicKey,
        })
      : await verifyDetachedSignedMessage({
          text: parsed.data.text,
          armoredSignature: parsed.data.detachedSignature!,
          armoredPublicKey: gpgRecord.publicKey,
        });

  if (!result.valid) {
    return { verified: false, reason: result.reason };
  }

  return {
    verified: true,
    fingerprint: result.fingerprint,
    signerEmail: result.signerEmail,
  };
});
