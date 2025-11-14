import { createAuthClient } from 'better-auth/vue';
import {
  magicLinkClient,
  organizationClient,
} from 'better-auth/client/plugins';
import { ac, owner, admin, member } from '~~/server/utils/permissions';

// const config = useRuntimeConfig()

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000',
  plugins: [
    magicLinkClient(),
    organizationClient({
      ac,
      roles: {
        owner,
        admin,
        member,
      },
    }),
  ],
});
