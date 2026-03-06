# PitaMai Account

Nuxt 4 + Better Auth を使用した、OIDC互換の OAuth 2.1 認証サーバー、組織管理システム、Wiki プラットフォーム、およびメールクライアントです。

## 特徴

- **OAuth 2.1 / OIDC:** Better Auth による完全な認証・認可機能
- **組織管理:** ロールベースアクセス制御（RBAC）対応の組織管理
- **監査ログ:** すべてのアクション監視と詳細なログ出力
- **Wiki:** Markdown 対応、組織ごとに管理可能な Wiki プラットフォーム
- **メール:** IMAP/SMTP 対応、SSE によるリアルタイム新着通知
- **デザイン:** Nuxt UI v4 ベースのシンプルでクリーンなインターフェース

## 技術スタック

- **Framework:** Nuxt 4
- **UI:** Nuxt UI v4
- **Database ORM:** Prisma（PostgreSQL）
- **Authentication:** Better Auth
- **Mail:** imapflow、nodemailer、mailparser
- **Language:** TypeScript
- **Package Manager:** pnpm

## 開発の開始

### 前提条件

- Node.js 18+
- PostgreSQL
- pnpm

### インストール

```bash
pnpm install
```

### マイグレーション実行

```bash
pnpm run migration:prisma
pnpm run migration:better-auth
```

### 開発サーバー起動

```bash
pnpm dev
```

アプリケーションは `http://localhost:3000` で起動します。

## ドキュメント

詳細は [docs/](docs/) を参照してください。
