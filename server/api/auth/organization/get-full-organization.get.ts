import { auth } from '~~/server/utils/auth';
import { createError } from 'h3';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string | undefined;

  // auth.api.getFullOrganization に headers を渡すことで認可チェックが行われます
  return await auth.api.getFullOrganization({
    query: { organizationId },
    headers: event.headers,
  });
});
