import { auth } from '~~/server/utils/auth';
import { getQuery, createError } from 'h3';
import * as z from 'zod';

const listMembersSchema = z.object({
    organizationId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(), // 最大100件に制限（必要に応じて調整）
    offset: z.coerce.number().int().min(0).optional(),
    sortBy: z.string().optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    filterField: z.string().optional(),
    filterOperator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains']).optional(),
    filterValue: z.string().optional(),
});

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = listMembersSchema.safeParse(query);

        if (!result.success) {
            throw createError({
                statusCode: 422,
                message: 'Validation Error',
            });
        }

        const validated = result.data;

        // 認証情報を全ヘッダーごと渡す（better-auth公式推奨）
        const { headers } = event;
        const data = await auth.api.listMembers({
            query: validated,
            headers,
        });
        return data;
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error('List members error:', e);
            throw createError({ statusCode: 400, message: 'メンバー一覧の取得に失敗しました' });
        }
        throw createError({ statusCode: 500, message: 'Internal Server Error' });
    }
});