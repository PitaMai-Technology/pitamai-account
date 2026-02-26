/**
 * server/api/pitamai/mail/settings.post.ts
 *
 * メールアカウント設定の保存・更新エンドポイント。
 * 入力値をバリデーションしてから
 * - 既存レコードがあれば更新
 * - 無ければ新規作成
 * を行う。パスワードは AES-256-GCM で暗号化して保存。
 */
import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { encryptMailPassword } from '~~/server/utils/mail-crypto';
import { requireSessionUser } from '~~/server/utils/mail-account';

/**
 * リクエストボディ検証スキーマ。
 * password は任意で、既存レコードが無ければ必須となる。
 */
const schema = z.object({
  username: z.string().min(1, 'ユーザー名は必須です'),
  password: z.string().optional(),
  imapHost: z.string().min(1, 'IMAPホストは必須です'),
  imapPort: z.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  smtpHost: z.string().min(1, 'SMTPホストは必須です'),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
});

export default defineEventHandler(async event => {
  // セッションからユーザーを取得
  const user = await requireSessionUser(event);
  const body = await readBody(event);

  // ボディバリデーション
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  const existing = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
    select: {
      id: true,
      encryptedPassword: true,
      encryptionIv: true,
      encryptionAuthTag: true,
    },
  });

  // 新規登録時はパスワードが必須
  if (!existing && !parsed.data.password) {
    throw createError({
      statusCode: 422,
      message: '初回登録時はパスワードが必須です',
    });
  }

  // パスワードがあれば暗号化（設定が間違っていると例外）
  let encrypted: ReturnType<typeof encryptMailPassword> | null = null;
  if (parsed.data.password) {
    try {
      encrypted = encryptMailPassword(parsed.data.password);
    } catch {
      throw createError({
        statusCode: 500,
        message:
          '管理者側での暗号化キーが未設定です。.env に MAIL_CREDENTIAL_SECRET（16文字以上）を設定してください。',
      });
    }
  }

  // DB 更新/作成用ペイロード
  const payload = {
    emailAddress: user.email,
    username: parsed.data.username,
    imapHost: parsed.data.imapHost,
    imapPort: parsed.data.imapPort,
    imapSecure: parsed.data.imapSecure,
    smtpHost: parsed.data.smtpHost,
    smtpPort: parsed.data.smtpPort,
    smtpSecure: parsed.data.smtpSecure,
    ...(encrypted
      ? {
          encryptedPassword: encrypted.ciphertext,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
        }
      : {}),
  };

  // 既存があれば update、なければ create
  const account = existing
    ? await prisma.mailAccount.update({
        where: { id: existing.id },
        data: payload,
        select: {
          id: true,
          emailAddress: true,
          username: true,
          imapHost: true,
          imapPort: true,
          imapSecure: true,
          smtpHost: true,
          smtpPort: true,
          smtpSecure: true,
          updatedAt: true,
        },
      })
    : await prisma.mailAccount.create({
        data: {
          userId: user.id,
          emailAddress: user.email,
          username: parsed.data.username,
          imapHost: parsed.data.imapHost,
          imapPort: parsed.data.imapPort,
          imapSecure: parsed.data.imapSecure,
          smtpHost: parsed.data.smtpHost,
          smtpPort: parsed.data.smtpPort,
          smtpSecure: parsed.data.smtpSecure,
          encryptedPassword: encrypted?.ciphertext ?? '',
          encryptionIv: encrypted?.iv ?? '',
          encryptionAuthTag: encrypted?.authTag ?? '',
        },
        select: {
          id: true,
          emailAddress: true,
          username: true,
          imapHost: true,
          imapPort: true,
          imapSecure: true,
          smtpHost: true,
          smtpPort: true,
          smtpSecure: true,
          updatedAt: true,
        },
      });

  // 結果を返却
  return {
    ok: true,
    account,
  };
});
