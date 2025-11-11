import { createAuthClient } from 'better-auth/vue';
import { magicLinkClient, organizationClient, emailOTPClient } from 'better-auth/client/plugins';

// const config = useRuntimeConfig()

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000',
  plugins: [magicLinkClient(), organizationClient(), emailOTPClient()],
});