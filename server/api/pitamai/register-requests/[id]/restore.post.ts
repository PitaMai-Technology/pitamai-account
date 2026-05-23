import { createError } from 'h3';

export default defineEventHandler(async event => {
  throw createError({
    statusCode: 410,
    message: '却下、承認申請は再審査に戻せません',
  });
});
