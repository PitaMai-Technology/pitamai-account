import { createError, readBody } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { assertActiveMemberRole } from '~~/server/utils/authorize';
import { encryptMailPassword } from '~~/server/utils/mail-crypto';

const schema = z.object({
  userId: z.string().min(1, 'userIdは必須です'),
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
  await assertActiveMemberRole(event, ['admins', 'owner']);

  const body = await readBody(event);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    throw createError({
      statusCode: 404,
      message: '対象ユーザーが見つかりません',
    });
  }

  const existing = await prisma.mailAccount.findUnique({
    where: {
      userId_emailAddress: { userId: user.id, emailAddress: user.email },
    },
    select: {
      id: true,
    },
  });

  if (!existing && !parsed.data.password) {
    throw createError({
      statusCode: 422,
      message: '初回登録時はパスワードが必須です',
    });
  }

  let encrypted: ReturnType<typeof encryptMailPassword> | null = null;
  if (parsed.data.password) {
    try {
      encrypted = encryptMailPassword(parsed.data.password);
    } catch {
      throw createError({
        statusCode: 500,
        message:
          '暗号化キーが未設定です。.env に MAIL_CREDENTIAL_SECRET（16文字以上）を設定してください。',
      });
    }
  }

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

  const account = existing
    ? await prisma.mailAccount.update({
        where: { id: existing.id },
        data: payload,
        select: {
          id: true,
          userId: true,
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
          userId: true,
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

  return {
    ok: true,
    account,
  };
});
