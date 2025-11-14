import { z } from 'zod';

/**
 * Nitro用のスキーマ定義
 */
export const magicLinkSignInSchema = z.object({
    email: z.email('有効なメールアドレスを入力してください'),
    name: z.string().optional(),
    callbackURL: z.string().optional(),
    newUserCallbackURL: z.string().optional(),
    errorCallbackURL: z.string().optional(),
});

/**
 * フロントエンド用のフォームスキーマ
 */
export const magicLinkFormSchema = z.object({
    email: z.email('有効なメールアドレスを入力してください'),
    name: z.string().optional(),
});

export type MagicLinkSignIn = z.infer<typeof magicLinkSignInSchema>;
export type MagicLinkForm = z.infer<typeof magicLinkFormSchema>;
