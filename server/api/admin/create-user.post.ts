import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  return await auth.api.createUser({
    body: {
      email: body.email,
      password: body.password,
      name: body.name,
      role: body.role,
      data: body.data,
    },
    headers: getHeaders(event) as HeadersInit,
  });
});
