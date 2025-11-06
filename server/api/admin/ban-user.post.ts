import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  return await auth.api.banUser({
    body: {
      userId: body.userId,
      banReason: body.banReason,
      banExpiresIn: body.banExpiresIn,
    },
    headers: getHeaders(event) as HeadersInit,
  });
});
