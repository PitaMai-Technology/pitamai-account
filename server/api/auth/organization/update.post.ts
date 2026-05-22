import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    
    // auth.api.updateOrganization が内部で権限チェックを行います
    const data = await auth.api.updateOrganization({
      body,
      headers: event.headers,
    });

    return data;
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;
      
      logger.error(e, 'Update organization error');
      throw createError({
        statusCode: 400,
        message: '組織の更新に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
