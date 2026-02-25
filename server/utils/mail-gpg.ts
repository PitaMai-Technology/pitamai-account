/**
 * mail-gpg.ts
 *
 * GPG（OpenPGP）を用いたメール署名・検証のサーバーサイドユーティリティ。
 * 秘密鍵は mail-crypto と同じ AES-256-GCM で暗号化して DB に保存する。
 */
import * as openpgp from 'openpgp';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { createError } from 'h3';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// --------------------------------------------------------------------------
// 秘密鍵暗号化 / 復号（mail-crypto と同等のロジック）
// --------------------------------------------------------------------------

function resolveSecretKey(): Buffer {
  const rawSecret =
    process.env.MAIL_CREDENTIAL_SECRET || process.env.BETTER_AUTH_SECRET;

  if (!rawSecret || rawSecret.length < 16) {
    throw createError({
      statusCode: 500,
      message:
        '暗号化キーが未設定です。.env に MAIL_CREDENTIAL_SECRET（16文字以上）を設定してください。',
    });
  }

  return scryptSync(rawSecret, 'pitamai-gpg-salt', 32) as Buffer;
}

export type EncryptedGpgKey = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptGpgPrivateKey(armoredKey: string): EncryptedGpgKey {
  const key = resolveSecretKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(armoredKey, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptGpgPrivateKey(payload: EncryptedGpgKey): string {
  const key = resolveSecretKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// --------------------------------------------------------------------------
// 鍵ペア生成
// --------------------------------------------------------------------------

export async function generateGpgKeyPair(params: {
  name: string;
  email: string;
}): Promise<{
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    userIDs: [{ name: params.name, email: params.email }],
    format: 'armored',
  });

  const pubKey = await openpgp.readKey({ armoredKey: publicKey });
  const fingerprint = pubKey.getFingerprint().toUpperCase();

  return { publicKey, privateKey, fingerprint };
}

// --------------------------------------------------------------------------
// 署名付きメール本文生成（PGP/INLINE: --BEGIN PGP SIGNED MESSAGE-- 形式）
// --------------------------------------------------------------------------

export async function createSignedMessage(params: {
  text: string;
  armoredPrivateKey: string;
}): Promise<string> {
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: params.armoredPrivateKey,
  });

  const message = await openpgp.createCleartextMessage({ text: params.text });

  return openpgp.sign({
    message,
    signingKeys: privateKey,
  });
}

export async function createDetachedSignature(params: {
  text: string;
  armoredPrivateKey: string;
}): Promise<string> {
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: params.armoredPrivateKey,
  });

  const message = await openpgp.createMessage({ text: params.text });
  const signature = await openpgp.sign({
    message,
    signingKeys: privateKey,
    detached: true,
    format: 'armored',
  });

  return typeof signature === 'string'
    ? signature
    : Buffer.from(signature).toString('utf8');
}

export async function createEncryptedMessage(params: {
  text: string;
  armoredPublicKeys: string[];
}): Promise<string> {
  const keys = await Promise.all(
    params.armoredPublicKeys.map(armoredKey => openpgp.readKey({ armoredKey }))
  );

  const message = await openpgp.createMessage({ text: params.text });
  return openpgp.encrypt({
    message,
    encryptionKeys: keys,
    format: 'armored',
  });
}

export async function decryptEncryptedMessage(params: {
  armoredMessage: string;
  armoredPrivateKey: string;
}): Promise<string> {
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: params.armoredPrivateKey,
  });

  const message = await openpgp.readMessage({
    armoredMessage: params.armoredMessage,
  });

  const { data } = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
    format: 'utf8',
  });

  return data as string;
}

// --------------------------------------------------------------------------
// 署名検証
// --------------------------------------------------------------------------

export type GpgVerifyResult =
  | { valid: true; fingerprint: string; signerEmail: string | null }
  | { valid: false; reason: string };

export async function verifySignedMessage(params: {
  signedText: string;
  armoredPublicKey: string;
}): Promise<GpgVerifyResult> {
  try {
    const publicKey = await openpgp.readKey({
      armoredKey: params.armoredPublicKey,
    });

    const message = await openpgp.readCleartextMessage({
      cleartextMessage: params.signedText,
    });

    const verificationResult = await openpgp.verify({
      message,
      verificationKeys: publicKey,
    });

    const [sig] = verificationResult.signatures;
    if (!sig) {
      return { valid: false, reason: '署名が見つかりません' };
    }

    try {
      await sig.verified;
    } catch {
      return { valid: false, reason: '署名が無効です' };
    }

    const fingerprint = publicKey.getFingerprint().toUpperCase();
    const userId = publicKey.getUserIDs()[0];
    const emailMatch = userId?.match(/<(.+?)>/);
    const signerEmail = emailMatch?.[1] ?? userId ?? null;

    return { valid: true, fingerprint, signerEmail };
  } catch (e) {
    return {
      valid: false,
      reason:
        e instanceof Error ? e.message : '署名検証中にエラーが発生しました',
    };
  }
}

export async function verifyDetachedSignedMessage(params: {
  text: string;
  armoredSignature: string;
  armoredPublicKey: string;
}): Promise<GpgVerifyResult> {
  try {
    const publicKey = await openpgp.readKey({
      armoredKey: params.armoredPublicKey,
    });

    const message = await openpgp.createMessage({ text: params.text });
    const signature = await openpgp.readSignature({
      armoredSignature: params.armoredSignature,
    });

    const verificationResult = await openpgp.verify({
      message,
      signature,
      verificationKeys: publicKey,
    });

    const [sig] = verificationResult.signatures;
    if (!sig) {
      return { valid: false, reason: '署名が見つかりません' };
    }

    try {
      await sig.verified;
    } catch {
      return { valid: false, reason: '署名が無効です' };
    }

    const fingerprint = publicKey.getFingerprint().toUpperCase();
    const userId = publicKey.getUserIDs()[0];
    const emailMatch = userId?.match(/<(.+?)>/);
    const signerEmail = emailMatch?.[1] ?? userId ?? null;

    return { valid: true, fingerprint, signerEmail };
  } catch (e) {
    return {
      valid: false,
      reason:
        e instanceof Error ? e.message : '署名検証中にエラーが発生しました',
    };
  }
}

export async function verifyDetachedSignedBinaryMessage(params: {
  binaryData: Uint8Array;
  armoredSignature: string;
  armoredPublicKey: string;
}): Promise<GpgVerifyResult> {
  try {
    const publicKey = await openpgp.readKey({
      armoredKey: params.armoredPublicKey,
    });

    const message = await openpgp.createMessage({ binary: params.binaryData });
    const signature = await openpgp.readSignature({
      armoredSignature: params.armoredSignature,
    });

    const verificationResult = await openpgp.verify({
      message,
      signature,
      verificationKeys: publicKey,
    });

    const [sig] = verificationResult.signatures;
    if (!sig) {
      return { valid: false, reason: '署名が見つかりません' };
    }

    try {
      await sig.verified;
    } catch {
      return { valid: false, reason: '署名が無効です' };
    }

    const fingerprint = publicKey.getFingerprint().toUpperCase();
    const userId = publicKey.getUserIDs()[0];
    const emailMatch = userId?.match(/<(.+?)>/);
    const signerEmail = emailMatch?.[1] ?? userId ?? null;

    return { valid: true, fingerprint, signerEmail };
  } catch (e) {
    return {
      valid: false,
      reason:
        e instanceof Error ? e.message : '署名検証中にエラーが発生しました',
    };
  }
}

// --------------------------------------------------------------------------
// 受信メールが PGP Inline 署名かどうかを判定
// --------------------------------------------------------------------------

export function isPgpSignedText(text: string): boolean {
  return text.includes('-----BEGIN PGP SIGNED MESSAGE-----');
}

export function isPgpEncryptedText(text: string): boolean {
  return text.includes('-----BEGIN PGP MESSAGE-----');
}

// --------------------------------------------------------------------------
// 公開鍵サーバー検索（keys.openpgp.org）
// --------------------------------------------------------------------------

export async function fetchPublicKeyFromKeyServer(
  email: string
): Promise<string | null> {
  const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
  const url = `https://keys.openpgp.org/vks/v1/by-email/${encodedEmail}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/pgp-keys',
      },
    });

    if (!response.ok) {
      return null;
    }

    const armoredKey = await response.text();
    if (!armoredKey.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
      return null;
    }

    return armoredKey;
  } catch {
    return null;
  }
}
