/**
 * server/utils/mail-crypto.ts
 *
 * メール認証情報の暗号化・復号化ユーティリティ
 *
 * IMAP/SMTP 認証に使用するメールアカウントのパスワードを、
 * AES-256-GCM を用いて対称暗号化し、データベースに安全に保存します。
 *
 * 主な役割：
 * - パスワード暗号化（secrets から導出したキーを使用）
 * - パスワード復号化（IV と認証タグで整合性確認）
 * - シークレットキー導出（environment variable から安全に取得）
 * セキュリティ：
 * - 暗号化アルゴリズム: AES-256-GCM（認証付き）
 * - 秘密鍵生成: PBKDF2 相当（scryptSync）
 * - IV: ランダムに生成（毎回異なる密文）
 * - 認証タグ: 改ざん検知
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

// 暗号化アルゴリズムと IV 長を定義
const ALGORITHM = 'aes-256-gcm';

const IV_LENGTH = 12;

/**
 * 暗号化されたパスワードのペイロード型です。
 *
 * プロパティ：
 * - ciphertext: 暗号化されたデータ（base64）
 * - iv: 初期化ベクタ（base64）
 * - authTag: GCM 認証タグ（base64）
 *
 * 用途：
 * - DB 上に保存して複数のフィールドで実装
 * - 画后複号化で iv を変更した場合でも複号化が保知
 *
 * 特徴：
 * - 複数 MailAccount レコードで異なる iv を持らないよう注意
 *   （修正予定：一意性を確保するために複数をサポートする実装を検討）
 */
export type EncryptedMailPassword = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

/**
 * environment variable からシークレットキーを取得し、
 * scryptSync で KDF（鍵導出関数）を通して AES キーを生成します。
 *
 * 役割：
 * - MAIL_CREDENTIAL_SECRET または BETTER_AUTH_SECRET から秘密文を取得
 * - 秘密文を scryptSync で拡張・ハッシュ化（32 バイトの AES-256 キー化）
 *
 * 戻り値：
 * - 32 バイトの暗号化キー（Buffer）
 *
 * エラー：
 * - MAIL_CREDENTIAL_SECRET が未設定、または 16 文字未満の場合
 *
 * 注意：
 * - パフォーマンス：毎回 scryptSync が実行されるため、複数呼び出しは避ける
 * - 将来的には、キー導出結果をキャッシュする実装も検討
 */
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

/**
 * プレーンテキストのパスワードを AES-256-GCM で暗号化し、
 * IV と認証タグとともにペイロードとして返します。
 *
 * 役割：
 * - ランダムな IV を生成
 * - resolveSecretKey で暗号化キーを取得
 * - createCipheriv で暗号化オブジェクトを作成、パスワードを暗号化
 * - 密文、IV、認証タグを base64 化して返却
 *
 * パラメータ：
 * - plainPassword: 暗号化対象のメールアカウントパスワード（平文）
 *
 * 戻り値：
 * - EncryptedMailPassword オブジェクト（ciphertext, iv, authTag）
 *
 * 使用シーン：
 * - メールアカウント登録時にパスワードを DB に保存する前
 * - mail-account.ts から呼び出される（来週実装予定）
 *
 * セキュリティ：
 * - IV はランダムでユニークなため、同じパスワードでも毎回異なる密文が生成
 * - 認証タグにより改ざん検知が可能
 */
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

/**
 * EncryptedMailPassword ペイロードを復号化して、プレーンテキストのパスワードを復元します。
 *
 * 役割：
 * - payload から ciphertext, iv, authTag を抽出・デコード
 * - resolveSecretKey で復号化キーを取得
 * - createDecipheriv で復号化オブジェクトを作成、認証タグをセット
 * - 密文を復号化してプレーンテキストを返却
 *
 * パラメータ：
 * - payload: 暗号化済みパスワード（EncryptedMailPassword）
 *
 * 戻り値：
 * - 復号化されたパスワード（平文・文字列）
 *
 * 使用シーン：
 * - IMAP/SMTP 接続時に DB からパスワードを読み込んで復号化
 * - imap.ts、mail-sync.ts から呼び出される
 *
 * エラー：
 * - 認証タグが一致しない場合（改ざん検知）→ 例外スロー
 * - base64 デコードエラー → 例外スロー
 */
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
