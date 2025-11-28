import { z } from 'zod';

export const UpdateMemberRoleSchema = z.object({
  organizationId: z.string().optional(),
  memberId: z.string().min(1, 'memberId is required'),
  role: z.enum(['member', 'admin', 'owner']),
});

export type UpdateMemberRole = z.infer<typeof UpdateMemberRoleSchema>;
