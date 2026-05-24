# PitaMai Account

Nuxt 4 + Better Auth を使用した、OIDC互換の OAuth 2.1 認証サーバー、組織管理システム、監査ログ機能を備えたアカウント管理システムです。

## 特徴

- **OAuth 2.1 / OIDC:** Better Auth による完全な認証・認可機能
- **組織管理:** ロールベースアクセス制御（RBAC）対応の組織管理
- **監査ログ:** すべてのアクション監視と詳細なログ出力
- **デザイン:** Nuxt UI v4 ベースのシンプルでクリーンなインターフェース

## 技術スタック

- **Framework:** Nuxt 4
- **UI:** Nuxt UI v4
- **Database ORM:** Prisma v6（PostgreSQL）
- **Authentication:** Better Auth
- **Language:** TypeScript
- **Package Manager:** pnpm v10

## 開発の開始

### 前提条件

- Node.js 24 +
- PostgreSQL
- pnpm v10

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

詳細は <https://outline-wiki.pitamai.com/s/4965015d-d59e-4f45-9c9e-3b1992d945d8> を参照してください。

## Docker

### 開発環境でのクイックデプロイ (Docker Compose)

ローカル開発環境で Docker Compose を使用して起動する手順です（`compose.yml` を使用）。

1. `.env.example` を `.env` にコピーし、必要な環境変数を設定します。

2. サービスをビルドして起動します:

```bash
docker compose up -d --build
```

3. (任意) PostgreSQL サービスが正常に起動（healthy）したら、Prisma マイグレーションを実行します:

```bash
docker compose run --rm prisma-migrate
```

4. アプリケーションは http://localhost:3000、Adminer（データベース管理ツール）は http://localhost:8080 でアクセス可能です。

### 本番環境でのデプロイ (compose.prod.yml)

本番環境（または Komodo 等のデプロイプラットフォーム）では、開発用ツール（Adminer）やローカルビルド設定を排除した `compose.prod.yml` を使用してデプロイします。

#### Komodo でのデプロイ手順の概要
1. **リポジトリ登録 (Repos)**: Komodo 上で本リポジトリを連携します。
2. **イメージのビルド (Builds)**: `Dockerfile` から本番用イメージをビルドし、コンテナレジストリへプッシュします。
3. **スタックの作成 (Stacks)**: `compose.prod.yml` の設定を入力します。
4. **環境変数の指定 (Environment)**: 必要なシークレット（`DATABASE_URL` や `BETTER_AUTH_SECRET` など）を Komodo の変数設定から安全に注入します。
5. **デプロイ実行**: スタックをデプロイし、Prisma マイグレーションを実行する Procedure を必要に応じて構成・実行します。
