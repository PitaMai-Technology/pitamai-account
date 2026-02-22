import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export type EncryptedMailPassword = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function resolveSecretKey(): Buffer {
  const rawSecret =
    process.env.MAIL_CREDENTIAL_SECRET || process.env.BETTER_AUTH_SECRET;

  if (!rawSecret || rawSecret.length < 16) {
    throw new Error(
      'MAIL_CREDENTIAL_SECRET is missing or too short (fallback: BETTER_AUTH_SECRET)'
    );
  }

  return scryptSync(rawSecret, 'pitamai-mail-credential', 32);
}

export function encryptMailPassword(
  plainPassword: string
): EncryptedMailPassword {
  const iv = randomBytes(IV_LENGTH);
  const key = resolveSecretKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainPassword, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptMailPassword(payload: EncryptedMailPassword): string {
  const key = resolveSecretKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const encrypted = Buffer.from(payload.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
