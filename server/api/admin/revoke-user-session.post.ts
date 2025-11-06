import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  return await auth.api.revokeUserSession({
    body: {
      sessionToken: body.sessionToken,
    },
    headers: getHeaders(event),
  });
});
