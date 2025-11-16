import { z } from 'zod';

/**
 * メンバー招待用のフォームスキーマ
 */
export const InviteMemberForm = z.object({
  email: z.email('有効なメールアドレスを入力してください'),
  role: z.enum(['member', 'admin', 'owner']),
  organizationId: z.string().min(1, 'Organization ID is required'),
  resend: z.boolean().optional().default(false),
});

export type InviteMemberForm = z.infer<typeof InviteMemberForm>;
