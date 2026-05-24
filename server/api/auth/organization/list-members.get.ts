import { auth } from '~~/server/utils/auth';
import { createError } from 'h3';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    
    // auth.api.listMembers が内部で権限チェックを行います
    return await auth.api.listMembers({
      query,
      headers: event.headers,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('statusCode' in e && (e.statusCode === 401 || e.statusCode === 403)) throw e;
      
      logger.error(e, 'List members error');
      throw createError({
        statusCode: 400,
        message: 'メンバー一覧の取得に失敗しました',
        cause: e,
      });
    }
    throw createError({ statusCode: 500, message: 'Internal Server Error' });
  }
});
