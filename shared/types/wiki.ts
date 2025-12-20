import { z } from 'zod';

export const wikiContentTypeSchema = z.enum(['markdown']);

export const wikiCreateSchema = z.object({
  title: z
    .string('（サーバー）タイトルを入力してください')
    .min(1, 'タイトルを入力してください')
    .max(100, 'タイトルは100文字以内で入力してください'),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'スラッグは小文字英数字とハイフンのみ使用できます'
    )
    .optional(),
  content: z.string().optional().default(''),
  contentType: wikiContentTypeSchema.optional().default('markdown'),
});

export const wikiUpdateSchema = z.object({
  title: z
    .string()
    .min(1, 'タイトルを入力してください')
    .max(100, 'タイトルは100文字以内で入力してください')
    .optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'スラッグは小文字英数字とハイフンのみ使用できます'
    )
    .optional(),
  content: z.string().optional(),
  contentType: wikiContentTypeSchema.optional(),
});

export type WikiCreateInput = z.infer<typeof wikiCreateSchema>;
export type WikiUpdateInput = z.infer<typeof wikiUpdateSchema>;
