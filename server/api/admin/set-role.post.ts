import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  return await auth.api.setRole({
    body: {
      userId: body.userId,
      role: body.role,
    },
    headers: getHeaders(event) as HeadersInit,
  });
});
