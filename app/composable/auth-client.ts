import { createAuthClient } from 'better-auth/vue';
import { magicLinkClient, adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [magicLinkClient(), adminClient()],
});
