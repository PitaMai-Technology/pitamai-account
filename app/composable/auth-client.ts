import { createAuthClient } from 'better-auth/vue';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import {
  emailOTPClient,
  organizationClient,
  adminClient,
  inferAdditionalFields,
} from 'better-auth/client/plugins';
import { ac, owner, admins, member } from '~~/server/utils/permissions';

// const config = useRuntimeConfig();

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        twitterUrl: {
          type: 'string',
        },
        bio: {
          type: 'string',
        },
      },
    }),
    oauthProviderClient(),
    emailOTPClient(),
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
