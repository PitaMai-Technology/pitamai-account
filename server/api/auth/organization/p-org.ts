import { auth } from '~~/server/utils/auth';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
    try {
        const slug = getQuery(event).slug as string;

        if (!slug) {
            throw createError({
                statusCode: 400,
                statusMessage: 'スラッグが指定されていません',
            });
        }

        // 組織情報を取得
        const organization = await auth.api.getFullOrganization({
            query: {
                organizationSlug: slug,
            },
            headers: event.headers,
        });

        if (!organization) {
            throw createError({
                statusCode: 404,
                statusMessage: '組織が見つかりません',
            });
        }

        return organization;
    } catch (e: unknown) {
        console.error('Get organization error:', e);
        if (e instanceof Error && e.message.includes('404')) {
            throw createError({
                statusCode: 404,
                statusMessage: '組織が見つかりません',
            });
        }
        throw createError({
            statusCode: 500,
            statusMessage: 'Internal Server Error',
        });
    }
});