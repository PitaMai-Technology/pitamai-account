import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import * as z from 'zod';
import { logger } from '~~/server/utils/logger';

const setActiveOrganizationSchema = z
  .object({
    organizationId: z.string().nullable().optional(),
    organizationSlug: z.string().optional(),
  })
  .refine(
    data =>
      data.organizationId !== undefined || data.organizationSlug !== undefined,
    {
      message:
        'organizationIdまたはorganizationSlugのいずれかを指定してください',
    }
  );

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const result = setActiveOrganizationSchema.safeParse(body);

    if (!result.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation Error',
        data: result.error,
      });
    }

    const validated = result.data;

    // 認証情報をヘッダーごと渡す
    const data = await auth.api.setActiveOrganization({
      body: validated,
      headers: event.headers,
    });

    return data;
  } catch (e: unknown) {
    logger.error(e, 'Set active organization error');
    if (e instanceof Error) {
      throw createError({
        statusCode: 400,
        statusMessage: 'アクティブな組織の切り替えに失敗しました',
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
});
