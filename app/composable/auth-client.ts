import { createAuthClient } from 'better-auth/vue';
import {
  magicLinkClient,
  organizationClient,
  adminClient,
} from 'better-auth/client/plugins';
import { ac, owner, admins, member } from '~~/server/utils/permissions';

// const config = useRuntimeConfig();

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    magicLinkClient(),
    adminClient({
      ac,
      roles: {
        owner,
        admins,
        member,
      },
    }),
    organizationClient({
      ac,
      roles: {
        owner,
        admins,
        member,
      },
    }),
  ],
});
