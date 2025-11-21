# MaiMai Hub

Nuxt 4 + Better Auth を使用した、パスワードレス認証＆組織管理システムです。

## 機能

### 認証機能

- 🔐 **Magic Link認証**: パスワード不要のメール認証リンク
- 📧 **メールログイン**: メールアドレスだけで簡単ログイン
- 🚪 **ログアウト**: セッション破棄
- ✅ **自動ユーザー登録 / 事前登録**:
  - `/login` からの Magic Link で新規ユーザー登録
  - 管理画面からのアカウント事前登録（招待メール送信）

### 組織・メンバー管理

- 🏢 組織作成（管理画面 `/apps/admin/create-organization`）
- 🔁 アクティブ組織の切り替え
- 👥 メンバー一覧・検索（`/apps/admin/member`）
- ✉️ メンバー招待（`/apps/admin/member-add`）
- 🎫 組織招待の承認（`/apps/organization/accept-invitation`）

### セキュリティ

- トークンベースのメール認証（5分間有効）
- SQLite + Prisma によるセッション／ユーザー管理
- Better Auth による認証フロー
- Zod によるサーバー・フロント両方でのバリデーション
- Better Auth Organization + Access Control によるロール管理（`owner` / `admin` / `member`）

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env` ファイルを作成して以下を設定：

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

このプロジェクトの DB は **Prisma v6** を基準としているため、
グローバルにインストールされた `npx` ではなく、**常に `pnpm exec` を使用**してください。

1. 初期化

```bash
pnpm exec prisma generate
pnpm generate:better-auth
```

2. マイグレーションの実行

```bash
pnpm exec prisma migrate dev --name better-auth
```

### 4. 開発サーバーの起動

```bash
pnpm dev
```

サーバーは `http://localhost:3000` で起動します。

5. prisma studio の起動（任意）

```bash
pnpm exec prisma studio
```

localhost:5555で起動します。

## 使用方法

### 認証フロー（Magic Link）

1. **ログインページにアクセス** (`/login`)
   - メールアドレス（＋任意の名前）を入力
2. **メールを確認**
   - 入力したメールアドレスにログインリンクが送信されます
   - リンクは 5 分間有効です
3. **リンクをクリック**
   - メール内のリンクをクリックすると認証され、
     Better Auth の設定に基づきコールバック URL（例: `/apps/dashboard`）へリダイレクトされます
4. **ダッシュボード**
   - `/apps/dashboard` でユーザー情報・セッション情報・所属組織を確認できます
   - ログアウトボタンでセッションを終了できます

### 管理画面の構成（/apps 配下）

- `/apps/dashboard`  
  認証済みユーザー向けのダッシュボード
- `/apps/admin/account-add`  
  管理者によるアカウント事前登録 + Magic Link 送信
- `/apps/admin/create-organization`  
  組織の作成
- `/apps/admin/member`  
  メンバー一覧・検索
- `/apps/admin/member-add`  
  メンバー招待
- `/apps/organization/[id]`  
  組織詳細ページ（URL から組織を切り替え）

※ `/apps/**` へのアクセスは `app/middleware/auth.global.ts` によって保護され、
`/apps/admin/**` へのアクセスはロール（`admin` 以上）に基づくガードで制御されています。

## API エンドポイント（抜粋）

### Magic Link 認証 API（Better Auth ラッパー）

#### `POST /api/auth/sign-in/magic-link`

Magic Link を送信します。  
`shared/types/magic-link.ts` の `magicLinkSignInSchema` によるバリデーションを通ります。

**リクエスト例:**

```json
{
  "email": "user@example.com",
  "callbackURL": "/apps/dashboard",
  "newUserCallbackURL": "/apps/dashboard?welcome=true",
  "errorCallbackURL": "/error"
}
```

#### `POST /api/auth/pre-register`

管理画面からのアカウント事前登録用エンドポイントです。  
既存ユーザーの場合は新規作成せず情報のみ返します。

---

実装の詳細はそれぞれのファイルを参照してください：

- 認証クライアント: [`app/composable/auth-client.ts`](app/composable/auth-client.ts)
- Better Auth 設定: [`server/utils/auth.ts`](server/utils/auth.ts)
- 組織ロール / アクセス制御: [`server/utils/permissions.ts`](server/utils/permissions.ts)
- 認証ミドルウェア: [`app/middleware/auth.global.ts`](app/middleware/auth.global.ts)
- 管理者ガード: [`app/middleware/only-admin.global.ts`](app/middleware/only-admin.global.ts)
