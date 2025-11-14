# PitaMAI - Magic Link Authentication

Nuxt 3 + Better Auth を使用した、パスワードレス認証システムです。

## 機能

### 認証機能

- 🔐 **Magic Link認証**: パスワード不要のメール認証リンク
- 📧 **メールログイン**: メールアドレスだけで簡単ログイン
- 🚪 **ログアウト**: セッション破棄
- ✅ **自動ユーザー登録**: 新規ユーザーも同じフローで登録可能

### セキュリティ

- トークンベースのメール認証（5分間有効）
- SQLiteデータベースによるセッション管理
- Better Authによる安全な認証フロー
- Zodによるバリデーション

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env`ファイルを作成して以下を設定：

```env
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000

# データベース設定
DATABASE_URL="file:./prisma/dev.db"

# メール送信設定
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM="PitaMAI <noreply@example.com>"
```

### 3. データベースのマイグレーション

```bash
pnpm migration:better-auth
```

### 4. 開発サーバーの起動

```bash
pnpm dev
```

サーバーは `http://localhost:3000` で起動します。

## 使用方法

### Magic Link認証の流れ

1. **ログインページにアクセス** (`/`)
   - メールアドレスを入力
2. **メールを確認**
   - 入力したメールアドレスにログインリンクが送信されます
   - リンクは5分間有効です
3. **リンクをクリック**
   - メール内のリンクをクリックすると自動的に認証されます
   - ダッシュボード (`/dashboard`) にリダイレクトされます

4. **ダッシュボード**
   - ユーザー情報とセッション情報を確認できます
   - ログアウトボタンでセッションを終了できます

### ページ構成

- `/` - ログインページ（Magic Link送信）
- `/verify` - Magic Link検証ページ（自動リダイレクト）
- `/dashboard` - ダッシュボード（認証後）

## API エンドポイント

### Magic Link認証 API

#### `POST /api/auth/sign-in/magic-link`

Magic Linkを送信

**リクエスト:**

```json
{
  "email": "user@example.com",
  "callbackURL": "/dashboard"
}
```

#### `GET /api/auth/magic-link/verify?token=xxx`

Magic Linkを検証してセッションを作成

**パラメーター:**

- `token`: メール内のリンクに含まれるトークン
  {
  "setupComplete": true,
  "message": "初回セットアップは終了しています。"
  }
