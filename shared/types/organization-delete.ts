import { z } from 'zod';

export const organizationDeleteSchema = z.object({
  organizationId: z.string('組織を選択してください'),
  organizationName: z.string('組織名を入力してください'),
});

export type OrganizationDeleteForm = z.infer<typeof organizationDeleteSchema>;
