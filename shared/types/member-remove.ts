import { z } from 'zod';

export const RemoveMemberSchema = z
  .object({
    organizationId: z.string().optional(),
    memberIdOrEmail: z
      .string()
      .min(1, 'memberIdOrEmail is required')
      .optional(),
    memberId: z.string().min(1, 'memberId is required').optional(),
  })
  .refine(data => !!(data.memberIdOrEmail || data.memberId), {
    message: 'memberIdOrEmail or memberId is required',
  });

export type RemoveMember = z.infer<typeof RemoveMemberSchema>;
