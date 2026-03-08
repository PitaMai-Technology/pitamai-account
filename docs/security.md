## OIDC / OAuth セキュリティ設定ガイド

このプロジェクトで実装されているセキュリティ対策の一覧と説明です。

---

### 1. PKCE（Proof Key for Code Exchange）

**目的**: Authorization Code Flow でのコード盗聴を防止

**実装ファイル**: [server/utils/auth.ts](../../server/utils/auth.ts#L175)

```typescript
oauthProvider({
  // PKCE を全クライアントに強制
  requirePKCE: true,
  ...
})
```

**仕組み**:

- クライアントが `code_challenge` を認可リクエストに含める
- 認可コード取得時、クライアントが `code_verifier` を送信して検証
- コード盗聴されても `code_verifier` がないと無効（署名検証される）

**RFC**: [RFC 7636 - Proof Key for Public Clients](https://tools.ietf.org/html/rfc7636)

---

### 2. Refresh Token Rotation

**目的**: トークンリプレイ攻撃の抑止

**実装ファイル**: [server/utils/auth.ts](../../server/utils/auth.ts#L178)

```typescript
oauthProvider({
  disableRefreshTokenRotation: false, // 有効化（デフォルト）
  ...
})
```

**仕組み**:

- Refresh Token 使用時、新しい Refresh Token が発行される
- 古い Refresh Token は即座に無効化
- 攻撃者がトークンを盗聴・再利用しようとしても、正規ユーザーが先に新トークンを取得済みで無効になっている

**結果**: 不正使用が検知しやすく、窓口を狭める

---

### 3. セキュアな Cookie 設定

**目的**: XSS/CSRF 攻撃でのセッション盗聴を防止

**実装ファイル**: [server/utils/auth.ts](../../server/utils/auth.ts#L20)

```typescript
export const auth = betterAuth({
  cookie: {
    httpOnly: true,      // JavaScript からアクセス不可（XSS 対策）
    secure: true,        // HTTPS のみで送信（盗聴対策）
    sameSite: 'strict',  // CSRF 対策（同一サイトリクエストのみ）
    maxAge: 7 * 24 * 60 * 60, // 7日間のセッション有効期限
  },
  ...
})
```

**設定の意味**:
| 項目 | 値 | 対策 |
|------|-----|------|
| `httpOnly` | `true` | JavaScript（`document.cookie`）からのアクセスを禁止 → XSS 時でもセッション盗聴不可 |
| `secure` | `true` | HTTPS のみで送信 → 通信盗聴時も平文ではない |
| `sameSite` | `'strict'` | 別オリジンからのリクエストに Cookie を付けない → CSRF 攻撃を原理的に防止 |
| `maxAge` | 604800秒 | 7日間で自動期限切れ → 長期盗聴の窓口を縮める |

---

### 4. レート制限（Rate Limiting）

**目的**:

- トークンエンドポイント（`/api/auth/oauth2/token`）へのブルートフォース攻撃防止
- リフレッシュトークン使用時の無制限リプレイ攻撃防止

**実装ファイル**: [server/middleware/rate-limit-oauth.ts](../../server/middleware/rate-limit-oauth.ts)

```typescript
// 制限設定
- 60秒間に 10リクエスト/IP まで
- 超過時: HTTP 429 (Too Many Requests)
```

**設定の意味**:

- クライアントIP ごとに 60秒 = 1ウィンドウ
- ウィンドウ内で 10リクエスト以上は拒否
- 攻撃者が短時間に大量にトークンを試行するのを防ぐ

**本番環境での推奨**:  
簡易実装（メモリ内）なので、大規模運用・分散環境では Redis を使った分散レート制限への移行を推奨。

```typescript
// 例: Redis + viem を使う場合
// npm install redis
// レート制限ロジックを Redis に移し、複数サーバーで共有キーを参照
```

---

### 5. Token TTL（有効期限）の確認

**デフォルト設定**（Better Auth の標準値）:

- **アクセストークン**: 1時間（調整可能）
- **リフレッシュトークン**: 30日（調整可能）
- **認可コード**: 10分（OIDC 標準）

必要に応じて `server/utils/auth.ts` の `oauthProvider` で以下をカスタマイズ：

```typescript
oauthProvider({
  // 例: カスタム TTL を設定する場合
  // accessTokenExpiresIn: 3600, // 1時間
  // refreshTokenExpiresIn: 2592000, // 30日
  ...
})
```

---

### 6. State Parameter 検証（自動）

**目的**: CSRF 攻撃による redirect 乗っ取り防止

Better Auth は **自動的に** state parameter を生成・検証しているため、追加設定は不要。

**仕組み**:

1. クライアントが認可リクエスト時に `state=xxx` を送信
2. ユーザーがログイン後、同じ `state=xxx` で Callback URL にリダイレクト
3. 一致しないと認可をキャンセル

---

## 監査・ログの強化

以下も本番環境では推奨：

1. **OAuth イベントのログ出力**
   - Token 発行、Refresh Token 使用、コンセント など
   - `server/utils/audit.ts` 経由で記録

2. **不正アクセスの検知**
   - 同一IP からの PKCE エラー多数
   - Rate limit 突破試行（429エラー頻発）

3. **トークン無効化ログ**
   - セッション削除時にトークンも無効化したか確認
   - 関連テーブル: `OauthAccessToken`, `OauthRefreshToken`, `OauthConsent`

---

## チェックリスト

本番環境へのデプロイ前に確認：

- [ ] HTTPS が有効か（Cookie の `secure: true` のため）
- [ ] `BETTER_AUTH_SECRET` が十分にランダムか（.env で確認）
- [ ] PKCE が全クライアントで有効か（管理画面で各クライアント作成時）
- [ ] レート制限の値（10リクエスト/60秒）が適切か
- [ ] リフレッシュトークン有効期限は要件に合っているか
- [ ] セッションタイムアウト（cookie maxAge）は適切か
- [ ] テスト環境での PKCE フロー動作確認
- [ ] ログインして同意画面を通したエンドツーエンドテスト
