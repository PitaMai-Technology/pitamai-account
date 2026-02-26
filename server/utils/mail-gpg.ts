/**
 * server/utils/mail-gpg.ts
 *
 * GPG（OpenPGP）によるメール署名・暗号化・検証ユーティリティ
 *
 * openpgp.js ライブラリを用いて、メールの PGP/MIME 生成、署名検証、暗号化・復号化を実現します。
 * 秘密鍵は mail-crypto と同じ AES-256-GCM で暗号化してデータベースに保存します。
 *
 * 主な役割：
 * - 秘密鍵の生成・暗号化・復号化（mail-crypto と同等の実装）
 * - PGP 鍵ペア生成（ECC 楕円曲線暗号）
 * - メール本文への署名（cleartext/detached/encrypted）
 * - 受信メール署名の検証（cleartext/detached/バイナリ対応）
 * - OpenPGP キーサーバー（keys.openpgp.org）からの公開鍵取得
 *
 * セキュリティ：
 * - 秘密鍵暗号化: AES-256-GCM（mail-crypto と同一）
 * - 署名・暗号化: OpenPGP.js v5 互換形式
 * - 改ざん検知: GCM 認証タグ + OpenPGP 署名検証
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

/**
 * 環境変数から暗号化キーを導出します。
 * @returns {Buffer} 32 バイトの AES-256 キー
 * @throws {Error} 環境変数が未設定または長さ不足の場合
 */
function resolveSecretKey(): Buffer {
  const rawSecret =
    process.env.MAIL_CREDENTIAL_SECRET || process.env.BETTER_AUTH_SECRET;

  if (!rawSecret || rawSecret.length < 16) {
    throw createError({
      statusCode: 500,
      message:
        '暗号化キーが未設定です。.env(環境変数) に MAIL_CREDENTIAL_SECRET、またはBETTER_AUTH_SECRET（16文字以上）を設定してください。',
    });
  }

  return scryptSync(rawSecret, 'pitamai-gpg-salt', 32) as Buffer;
}

/**
 * 秘密鍵を暗号化されたペイロードに変換します。
 *
 * 役割：
 * - OpenPGP 秘密鍵（armored 形式）を AES-256-GCM で暗号化
 * - DB 保存前の処理（UserGpgKey テーブル行）
 *
 * パラメータ：
 * - armoredKey: PEM 形式（-----BEGIN ... -----）の秘密鍵文字列
 *
 * 戻り値：
 * - EncryptedGpgKey オブジェクト（ciphertext, iv, authTag）
 */
export type EncryptedGpgKey = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

/**
 * ARMOR 形式の GPG 秘密鍵を AES-GCM で暗号化します。
 * @param {string} armoredKey - 暗号化対象の秘密鍵文字列
 * @returns {EncryptedGpgKey} 暗号化ペイロード
 */
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

/**
 * EncryptedGpgKey ペイロードを復号して秘密鍵文字列を取得します。
 * @param {EncryptedGpgKey} payload - 暗号化された鍵ペイロード
 * @returns {string} 復号された ARMOR 秘密鍵
 * @throws {Error} 認証タグ不一致等で復号に失敗した場合
 */
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

/**
 * 新しい GPG 鍵ペアを生成します。
 * @param {{name:string,email:string}} params - ユーザー名とメールアドレス
 * @returns {Promise<{publicKey:string,privateKey:string,fingerprint:string}>} 鍵ペアとフィンガープリント
 */
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

/**
 * プレーンテキストメール本文を PGP cleartext 署名形式で生成します。
 *
 * フォーマット：
 * - "-----BEGIN PGP SIGNED MESSAGE-----" で始まる形式
 * - メール本文と署名が一体化した形式（RFC 2440）
 *
 * 役割：
 * - 署名のみ（暗号化なし）でメールを送信
 * - 受信側で署名検証が容易（コンテンツタイプは text/plain）
 *
 * パラメータ：
 * - text: 署名対象のメール本文
 * - armoredPrivateKey: decryptGpgPrivateKey で復号化した秘密鍵
 *
 * 戻り値：
 * - cleartext 署名形式の文字列（-----BEGIN PGP SIGNED MESSAGE-----...）
 *
 * 使用シーン：
 * - メール送信時の署名のみモード
 */
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

/**
 * メール本文に detached 署名（分離型署名）を生成します。
 *
 * 用途：
 * - 本文と署名を分離して multipart/signed で送信
 * - 本文に添付ファイルがある場合など、content-type が複雑な場合に使用
 *
 * パラメータ：
 * - text: 署名対象のメール本文
 * - armoredPrivateKey: 秘密鍵（decryptGpgPrivateKey で取得）
 *
 * 戻り値：
 * - armored 形式の署名文字列（-----BEGIN PGP SIGNATURE-----...）
 *
 * 使用シーン：
 * - メール送信時の multipart/signed 生成
 * - 本文と署名を別の MIME パートに分割
 */
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

/**
 * メール本文を PGP/MIME multipart/encrypted 形式で暗号化します。
 *
 * 役割：
 * - 複数の受信者公開鍵を用いて本文を暗号化
 * - 送信者自身の公開鍵も暗号化対象に含める（送信済みフォルダで復号可能にするため）
 *
 * パラメータ：
 * - text: 暗号化対象のメール本文（既署名または平文）
 * - armoredPublicKeys: 受信者および送信者の公開鍵配列（armored）
 *
 * 戻り値：
 * - armored 形式の暗号化メッセージ（-----BEGIN PGP MESSAGE-----...）
 *
 * 使用シーン：
 * - メール送信時の multipart/encrypted 生成
 * - 署名済みメール本文をさらに暗号化する場合も対応
 */
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

/**
 * 暗号化されたメール本文を復号化します。
 *
 * 役割：
 * - 受信者自身の秘密鍵を用いてメール本文を復号化
 * - 署名済みの暗号化メールの場合、復号後の本文には署名も含まれる
 *
 * パラメータ：
 * - armoredMessage: armored 形式の暗号化メッセージ
 * - armoredPrivateKey: 秘密鍵（decryptGpgPrivateKey で取得）
 *
 * 戻り値：
 * - 復号化されたメール本文（UTF-8 文字列）
 *
 * エラー：
 * - 秘密鍵で復号化できない場合 → 例外スロー
 *
 * 使用シーン：
 * - 受信メール詳細表示時の暗号化メール復号
 * - message.get.ts などから呼び出し
 */
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

/**
 * 署名検証結果の型定義です。
 *
 * 成功時：
 * - valid: true
 * - fingerprint: 署名者の鍵フィンガープリント（40 文字 16 進）
 * - signerEmail: 署名者のメールアドレス（抽出可能な場合）
 *
 * 失敗時：
 * - valid: false
 * - reason: 失敗理由（署名なし、無効な署名、エラーメッセージ等）
 */
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
/**
 * cleartext 署名形式（-----BEGIN PGP SIGNED MESSAGE-----）のメール本文を検証します。
 *
 * 役割：
 * - OpenPGP cleartext メール（署名と本文が一体化）の署名を検証
 * - 署名者の公開鍵を用いて改ざんチェック
 *
 * パラメータ：
 * - signedText: cleartext 署名メール本体
 * - armoredPublicKey: 署名者の公開鍵（armored）
 *
 * 戻り値：
 * - GpgVerifyResult（成功時は fingerprint + signerEmail、失敗時は reason）
 *
 * 使用シーン：
 * - 受信メール表示時に署名を自動検証
 * - imap.ts の getMessageDetail などから呼び出し
 *//**
 * detached 署名形式（署名と本文が分離）のメール本文を検証します。
 *
 * 役割：
 * - multipart/signed の署名パートと本文パートを個別に検証
 * - テキスト本文用のヘルパー
 *
 * パラメータ：
 * - text: 署名対象のメール本文（平文）
 * - armoredSignature: 分離された署名（-----BEGIN PGP SIGNATURE-----...）
 * - armoredPublicKey: 署名者の公開鍵
 *
 * 戻り値：
 * - GpgVerifyResult
 *
 * 使用シーン：
 * - multipart/signed の本文パートを検証
 * - imap.ts の extractMultipartSignedParts との組み合わせ
 */
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

/**
 * detached 署名形式のバイナリデータ（メール全体）を検証します。
 *
 * 役割：
 * - multipart/signed の完全な MIME 本体（バイナリ）を検証
 * - テキスト本文ではなくバイナリ（Buffer）で署名検証
 * - メール本体全体（ヘッダ + 本文）の改ざんチェック
 *
 * パラメータ：
 * - binaryData: メール本体のバイナリデータ（Uint8Array）
 * - armoredSignature: detached 署名
 * - armoredPublicKey: 署名者の公開鍵
 *
 * 戻り値：
 * - GpgVerifyResult
 *
 * 使用シーン：
 * - メール全体（MIME 構造含む）の署名検証
 * - imap.ts の fetchOne から取得した source（raw データ）を検証
 */
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

/**
 * テキストが PGP cleartext 署名形式かどうかを判定します。
 * @param {string} text - 判定対象のテキスト
 * @returns {boolean} PGP 署名が含まれている場合 true
 */
export function isPgpSignedText(text: string): boolean {
  return text.includes('-----BEGIN PGP SIGNED MESSAGE-----');
}

/**
 * テキストが PGP 暗号化メッセージかどうかを判定します。
 *
 * 返り値：
 * - true: "-----BEGIN PGP MESSAGE-----" を含む
 * - false: 含まない
 */
export function isPgpEncryptedText(text: string): boolean {
  return text.includes('-----BEGIN PGP MESSAGE-----');
}

/**
 * OpenPGP キーサーバー（keys.openpgp.org）から特定メールアドレスの公開鍵を取得します。
 *
 * 役割：
 * - 宛先メールアドレスの公開鍵をネットワークから検索
 * - DB に登録されていない受信者への暗号化メール送信を実現
 * - Windows キーサーバーを使用（プライバシー重視、プロトコル HKP）
 *
 * パラメータ：
 * - email: 検索対象のメールアドレス（例：alice@example.com）
 *
 * 戻り値：
 * - armored 形式の公開鍵（-----BEGIN PGP PUBLIC KEY BLOCK-----...）、取得失敗時は null
 *
 * ネットワーク動作：
 * - keys.openpgp.org への HTTPS GET リクエスト（Accept: application/pgp-keys）
 * - 取得失敗はサイレントに null 返却（ログ出力なし）
 *
 * 使用シーン：
 * - メール送信時に暗号化公開鍵がない受信者を検索
 * - 公開鍵サーバーへの登録をユーザーに案内（暗号化前）
 */
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
