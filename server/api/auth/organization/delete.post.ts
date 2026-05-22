import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    
    // auth.api.deleteOrganization が内部で権限チェックを行います
    return await auth.api.deleteOrganization({
      body,
      headers: event.headers,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;
      
      logger.error(e, 'Organization deletion error');
      throw createError({
        statusCode: 400,
        message: '組織の削除に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
