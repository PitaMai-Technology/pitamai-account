import { z } from 'zod';

/**
 * メンバー招待用の承認用のスキーマ
 */
export const acceptInvitationSchema = z.object({
  invitationId: z.string(),
  // .min(32, '有効な招待IDを指定してください'),
});

export type AcceptInvitationForm = z.infer<typeof acceptInvitationSchema>;
