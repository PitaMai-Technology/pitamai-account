import { z } from 'zod';

// 管理者が別ユーザーのメールを変更する用途（userId 必須）
export const userChangeEmailSchema = z.object({
  userId: z.string().min(32, 'ユーザーIDは32文字以上である必要があります'),
  newEmail: z.email('有効なメールアドレスを入力してください'),
});
export type UserChangeEmail = z.infer<typeof userChangeEmailSchema>;

// 設定画面など、ログイン中ユーザー自身のメールを変更する用途（userId は不要）
export const userChangeEmailSettingsSchema = z.object({
  newEmail: z.email('有効なメールアドレスを入力してください'),
});
export type UserChangeEmailSettings = z.infer<
  typeof userChangeEmailSettingsSchema
>;
