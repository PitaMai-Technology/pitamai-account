import { readBody, createError } from 'h3';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { randomUUID } from 'node:crypto';
import { assertActiveMemberRole } from '~~/server/utils/authorize';

const preRegisterSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().min(1).optional(),
});

export default defineEventHandler(async event => {
  try {
    await assertActiveMemberRole(event, ['admin', 'owner']);

    const body = await readBody(event);
    const result = preRegisterSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        message: 'Validation Error',
      });
    }

    const { email, name } = result.data;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      // 既に同じメールアドレスのユーザーが存在する場合は、新規作成しない
      return {
        id: existing.id,
        email: existing.email,
        created: false,
        message: 'このメールアドレスは既に存在します',
      };
    }

    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        name: name ?? email,
      },
    });

    return {
      id: user.id,
      email: user.email,
      created: true,
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('Pre-register user error:', e);
      throw createError({
        statusCode: 400,
        message: '事前登録に失敗しました',
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
