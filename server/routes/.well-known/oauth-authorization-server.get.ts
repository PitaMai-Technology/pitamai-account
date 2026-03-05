import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { auth } from '~~/server/utils/auth';

export default oauthProviderAuthServerMetadata(auth);
