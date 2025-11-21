# API仕様

このファイルはサーバー側に実装されている主要 API エンドポイントの一覧と利用方法をまとめたドキュメントです。  
コード実装は `server/api/*` 以下にあります。認証・組織系 API は Better Auth を使って実装しています。

> 備考
>
> - サーバー側実装は Better Auth / Prisma を利用しています。
> - server 内の import はプロジェクトルートの `~~` を使って行ってください。
> - 認証が必要なエンドポイントは呼び出し時にセッションやクッキーを正しく渡す必要があります。

---

## 共通

- ベースパス: `/api/*`（`server/api/` 以下）
  - /api/auth/ \* — はすべてBetter-authが支配しています。
- レスポンス: 成功時・失敗時とも JSON を返します。
- エラーハンドリング: Nuxt/H3 の `createError` を利用して適切な HTTP ステータスを返す実装が想定されています。

---

## 認証関連 (server/api/auth)

### POST /api/auth/sign-in/magic-link

- 概要: Magic Link を送信して認証プロセスを開始する
- 実装ファイル: `server/api/auth/sign-in/magic-link.post.ts`
- リクエスト例:

```json
{
  "email": "user@example.com",
  "callbackURL": "/apps/dashboard",
  "newUserCallbackURL": "/apps/dashboard?welcome=true",
  "errorCallbackURL": "/error"
}
```

- レスポンス: 送信成功の情報 or エラー

### POST /api/auth/pre-register

- 概要: 管理画面からの事前ユーザー登録（招待メール送信）
- 実装ファイル: `server/api/auth/pre-register.post.ts`
- リクエスト例:

```json
{
  "name": "Invitee Name",
  "email": "invitee@example.com",
  "callbackURL": "/apps/dashboard"
}
```

- 動作: 既存ユーザーなら情報を返す、未登録ならユーザー作成＆Magic Link発行

### GET /api/auth/get-session

- 概要: サーバー側から現在セッションを確認するためのエンドポイント
- 実装ファイル: `server/api/auth/get-session.ts`
- 認可: リクエストのヘッダから session 情報を確認して返す

---

## 組織関連 (server/api/auth/organization)

ベースパス: `/api/auth/organization/*`  
主要な実装ファイルは `server/api/auth/organization/` 以下にあります。

### POST /api/auth/organization/create

- 概要: 組織を新規作成する
- 実装: `server/api/auth/organization/create.post.ts`
- リクエスト例:

```json
{ "name": "Acme Corp" }
```

- 認可: 管理者権限（アプリの仕様に依存）

### POST /api/auth/organization/invite-member

- 概要: 組織へのメンバー招待メールを送る
- 実装: `server/api/auth/organization/invite-member.ts`
- リクエスト例:

```json
{
  "email": "newmember@example.com",
  "role": "member",
  "organizationId": "org_abc123",
  "callbackURL": "/apps/organization/accept-invitation"
}
```

### GET /api/auth/organization/list-members

- 概要: 組織内のメンバー一覧を取得する
- 実装: `server/api/auth/organization/list-members.get.ts`
- クエリ:
  - `organizationId` (必須)
  - `q` (オプション: 検索文字列)
- レスポンス: メンバー配列（id, email, role, joinedAt など）

### POST /api/auth/organization/set-active

- 概要: アクティブ組織を切り替えてセッションに保存する
- 実装: `server/api/auth/organization/set-active.ts`
- リクエスト:

```json
{ "organizationId": "org_abc123" }
```

- 動作: セッションの activeOrganization を更新

### POST /api/auth/organization/accept-invitation

- 概要: 招待メール内のトークンを使って招待を承認する
- 実装: `server/api/auth/organization/accept-invitation.ts`
- リクエスト: 招待トークン等
- 動作: 招待を確定し、場合によってはログイン／組織参加を行う

---

## 管理 API / ユーティリティ

- `server/api/[...all].ts` — server/auth/ディレクトリ直下はすべてbetter-authが支配しています。(汎用エンドポイント)
<!-- - `server/middleware/*` — サーバーサイド共通ミドルウェア（リクエスト検査・ヘッダ注入など） -->

---

## 認可・権限の設計ポイント

- 権限定義: `server/utils/permissions.ts` にて Prisma / Better Auth の AccessControl を定義（`member` / `admin` / `owner`）
- クライアントで権限判定を行う場合は `authClient.organization.checkRolePermission()` を使用して同期的に判定できます
- ルートガードは `app/middleware/only-admin.global.ts` で `/apps/admin/**` を守ります

---

## 実装参照箇所

- Better Auth 設定: `server/utils/auth.ts`
- 権限定義: `server/utils/permissions.ts`
- 認証 API 実装: `server/api/auth/*`
- 組織 API 実装: `server/api/auth/organization/*`
- ミドルウェア(クライアント): `app/middleware/auth.global.ts`, `app/middleware/only-admin.global.ts`

---

### 使い方メモ（クライアントから呼ぶ）

- 認証が必要なエンドポイント: リクエスト時に Cookie/セッションヘッダを付与
- 組織切り替え: `/api/auth/organization/set-active` を呼んだ後、クライアント側の activeOrganization を更新して UI を再レンダリング
