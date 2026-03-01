/**
 * server/api/pitamai/mail/gpg-key.post.ts
 *
 * ユーザーの GPG 鍵を生成またはインポートし、データベースに保存する処理。
 * - action = 'generate': ランダム鍵ペア生成
 * - action = 'import': 提供された鍵を検証して登録
 * 秘密鍵は AES-GCM で暗号化されて保存される。
 */
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

// リクエストボディは generate か import の二種類を受け付け
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
  // ユーザー・アカウント情報を取得
  const user = await requireSessionUser(event);
  const account = await requireMailAccountForUser({ event });
  const gpgIdentityEmail = account.username.trim();
  const body = await readBody(event);

  // バリデーション
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
    // 鍵ペア生成
    const kp = await generateGpgKeyPair({
      name: parsed.data.name,
      email: gpgIdentityEmail,
    });
    publicKey = kp.publicKey;
    privateKey = kp.privateKey;
    fingerprint = kp.fingerprint;
  } else {
    // インポート処理: 公開鍵と秘密鍵のフォーマットチェック
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

  // 秘密鍵を暗号化
  const encrypted = await encryptGpgPrivateKey(privateKey);

  // DB に upsert
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
