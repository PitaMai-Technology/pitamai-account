# API仕様

このファイルはサーバー側に実装されている主要 API エンドポイントの一覧と利用方法をまとめたドキュメントです。  
コード実装は `server/api/*` 以下にあります。認証・組織系 API は Better Auth を使って実装しています。

> 備考
>
> - サーバー側実装は Better Auth / Prisma を利用しています。
> - server 内の import はプロジェクトルートの `~~` を使って行ってください。
> - 認証が必要なエンドポイントは呼び出し時にセッションやクッキーを正しく渡す必要があります。
> - 補足: サーバーサイドの共通ミドルウェア `server/middleware/auth.ts` は現在 `/api/pitamai/*` パスのみに適用され、これらのエンドポイントでセッション確認（401）を行います。`/api/auth/*` 系は Better Auth によって別に管理されています。

---

### サーバーサイドのミドルウェア（`server/middleware/auth.ts`）

- 適用範囲: `/api/pitamai/*` にマッチするリクエストにのみ作用します。
- 目的: API レイヤーでの早期認証チェック。未認証のリクエストを早めに拒否して保護されたルートを守ります。
- 実装ポイント:
  - リクエストのヘッダをそのまま Better Auth API に渡し、`auth.api.getSession({ headers: event.headers })` を呼んでセッションを取得します。
  - セッションが無ければ 401 を返します（createError）。
  - パス検査により `(/api/pitamai/*)` にのみ作用し、Better Auth が管理する `/api/auth/*` とは役割を分離しています。

## 最近の変更（概要）

> 推奨コミットメッセージ: `chore: 依存関係更新と組織管理の改善`

- 依存関係の更新: `better-auth` を 1.3.34 -> 1.4.1 に更新。`@better-auth/telemetry` と `@better-auth/core` も 1.4.1 に揃えました。
- `better-call` を 1.0.19 -> 1.1.0 に更新しました。
- `pita-css` を削除しました（`package.json` / `pnpm-lock.yaml` を更新済み）。
- サーバー側で新しく追加されたエンドポイント: `/api/pitamai/owner-list`（自分が owner の組織一覧取得）と `/api/pitamai/pre-register`（メール検証付きの事前ユーザー登録）。
- 組織関連スキーマの更新: 組織作成時の `name` は最大 32 文字に制限され、組織削除スキーマでは `organizationName` がオプションになりました。
- サーバーサイド認証ミドルウェアの適用範囲を制限（`/api/pitamai/*` のみをチェック）しました。

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

### POST /api/pitamai/pre-register

- 概要: メール検証を行う事前ユーザー登録エンドポイント（`/api/pitamai/pre-register`）
- 実装ファイル: `server/api/pitamai/pre-register.post.ts`
- バリデーション: `email` は有効なメール形式（zod を使用）。`name` はオプション。
- 動作: 同じメールアドレスのユーザーが存在する場合は既存ユーザー情報を返し `created: false` を返します。未登録の場合は新規ユーザーを作成して `created: true` を返します。

リクエスト例:

```json
{
  "email": "invitee@example.com",
  "name": "Invitee Name"
}
```

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

- 注意: バリデーションが変更され、`name` は最大 32 文字に制限されています（`shared/types/organization-create.ts`）。

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

### POST /api/auth/organization/delete

- 概要: 組織を削除する（管理者操作）
- 実装: `server/api/auth/organization/delete.post.ts`
- リクエスト例:

```json
{ "organizationId": "org_abc123", "organizationName": "Acme Corp" }
```

- 注意: `organizationName` はオプションになっています（`shared/types/organization-delete.ts`）。バックエンドは `organizationId` を必須として処理します。

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

### GET /api/pitamai/owner-list

- 概要: リクエストしたユーザーが `owner` 権限を持つ組織の一覧を取得する
- 実装: `server/api/pitamai/owner-list.get.ts`

レスポンス: 所属する `owner` 権限の組織オブジェクト配列（id, name, slug など）を返します。

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

### クライアント側のミドルウェア（`app/middleware/*`）

- `auth.global.ts`:
  - 適用範囲: `/apps` 配下のルートを保護します（`/` はスキップ）。
  - 動作: サーバーサイドレンダリング時は Cookie をリクエストヘッダとして渡して `/api/auth/get-session` を呼び出し、セッションが無ければログインページ(`/`) にリダイレクトします。

- `only-admin.global.ts`:
  - 適用範囲: `/apps/admin` 配下のみ。
  - 動作: クライアント側でアクティブ組織の自分のロールを取得し（`authClient.organization.getActiveMemberRole()`）、`authClient.organization.checkRolePermission()` を使って権限を判定します。権限がない場合は `/apps/error` にリダイレクトします。

---

### 使い方メモ（クライアントから呼ぶ）

- 認証が必要なエンドポイント: リクエスト時に Cookie/セッションヘッダを付与
- 組織切り替え: `/api/auth/organization/set-active` を呼んだ後、クライアント側の activeOrganization を更新して UI を再レンダリング
