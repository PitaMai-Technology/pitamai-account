import { z } from 'zod';

export const organizationCreateSchema = z.object({
  name: z
    .string('（サーバー）組織名を入力してください')
    .max(32, '組織名は32文字以内で入力してください'),
  slug: z
    .string('（サーバー）スラッグを入力してください')
    .regex(/^[a-zA-Z0-9-]+$/, '英数字とハイフンのみ使用できます'),
});

export type OrganizationCreateForm = z.infer<typeof organizationCreateSchema>;
