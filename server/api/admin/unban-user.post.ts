import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  return await auth.api.unbanUser({
    body: {
      userId: body.userId,
    },
    headers: getHeaders(event) as HeadersInit,
  });
});
