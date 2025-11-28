import { z } from 'zod';

export const userUpdateSchema = z.object({
  userId: z.string().max(32, 'ユーザーIDは32文字以内である必要があります。'),
  data: z
    .object({
      name: z
        .string()
        .max(32, '名前は32文字以内である必要があります。')
        .optional(),
      image: z.string().optional(),
      email: z.email().optional(),
    })
    .refine(obj => Object.keys(obj).length > 0, {
      message: '更新するフィールドを1つ以上指定してください',
    }),
});

export type UserUpdate = z.infer<typeof userUpdateSchema>;
