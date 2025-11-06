import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  return await auth.api.adminUpdateUser({
    body: {
      userId: body.userId,
      data: body.data,
    },
    headers: getHeaders(event) as HeadersInit,
  });
});
