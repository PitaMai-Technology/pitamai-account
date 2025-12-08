import { z } from 'zod';

export const AuditListQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  organizationId: z.string().optional(),
});

export type AuditListQuery = z.infer<typeof AuditListQuerySchema>;
