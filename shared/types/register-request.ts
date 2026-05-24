import { z } from 'zod';

export const registerRequestSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  name: z
    .string()
    .min(1, '名前を入力してください')
    .max(100, '名前は100文字以内で入力してください'),
  age: z.coerce
    .number('年齢を入力してください')
    .int('年齢は整数で入力してください')
    .min(13, '年齢は13歳以上で入力してください')
    .max(150, '年齢が不正です'),
  discordId: z
    .string()
    .min(1, 'Discord ユーザー名を入力してください')
    .max(32, 'Discord ユーザー名は32文字以内で入力してください'),
  agreedToTerms: z
    .boolean()
    .refine(value => value === true, '同意項目に同意してください'),
});

export type RegisterRequestForm = z.infer<typeof registerRequestSchema>;
