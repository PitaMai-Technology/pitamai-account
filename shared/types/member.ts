import { z } from 'zod';

/**
 * Nitro用のスキーマ定義
 */
export const ListMembers = z.object({
  organizationId: z.string().optional(), // 内部ではIDを使用
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  filterField: z.string().optional(),
  filterOperator: z
    .enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'])
    .optional(),
  filterValue: z.string().optional(),
});

/**
 * フロントエンド用のフォームスキーマ
 */
export const ListMembersForm = z.object({
  organizationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(), // 最大100件に制限（必要に応じて調整）
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  filterField: z.string().optional(),
  filterOperator: z
    .enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'])
    .optional(),
  filterValue: z.string().optional(),
});

export type ListMembers = z.infer<typeof ListMembers>;
export type ListMembersForm = z.infer<typeof ListMembersForm>;
