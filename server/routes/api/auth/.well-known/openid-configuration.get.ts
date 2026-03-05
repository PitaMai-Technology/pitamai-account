import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { auth } from '~~/server/utils/auth';

export default oauthProviderOpenIdConfigMetadata(auth);
