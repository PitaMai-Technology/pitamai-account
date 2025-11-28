// typescript
import { z } from 'zod';

export const organizationUpdateSchema = z.object({
  // organizationId は省略可能（アクティブ組織を使うケースに対応）
  organizationId: z.string().min(1).optional(),

  // 更新するフィールド（少なくとも1つは指定する必要があります）
  data: z
    .object({
      name: z.string().max(32, '名前は32文字以内で入力してください').optional(),
      slug: z.string().min(1).optional(),
      logo: z.string().min(1).optional(),
    })
    .refine(obj => Object.values(obj).some(v => v !== undefined), {
      message: '少なくとも1つのフィールドを更新してください',
    }),
});

export type OrganizationUpdateForm = z.infer<typeof organizationUpdateSchema>;
