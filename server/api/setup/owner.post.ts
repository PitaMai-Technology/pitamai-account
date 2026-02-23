import { createError, defineEventHandler, readBody } from 'h3';
import { generateId } from 'better-auth';
import { z } from 'zod';
import prisma from '~~/lib/prisma';

const setupOwnerSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().trim().min(1).optional(),
});

export default defineEventHandler(async event => {
  const existingOwnerCount = await prisma.user.count({
    where: {
      role: 'owner',
    },
  });

  if (existingOwnerCount > 0) {
    throw createError({
      statusCode: 409,
      message: 'セットアップは既に完了しています',
    });
  }

  const body = await readBody(event);
  const result = setupOwnerSchema.safeParse(body);

  if (!result.success) {
    throw createError({
      statusCode: 422,
      message: 'Validation Error',
    });
  }

  const { email, name } = result.data;
  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    const updated = await prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        role: 'owner',
        name: name ?? existingUser.name,
        emailVerified: true,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      created: false,
      message: '既存ユーザーを owner に設定しました',
    };
  }

  const user = await prisma.user.create({
    data: {
      id: generateId(),
      email,
      name: name ?? email,
      role: 'owner',
      emailVerified: true,
    },
  });

  return {
    id: user.id,
    email: user.email,
    created: true,
  };
});
