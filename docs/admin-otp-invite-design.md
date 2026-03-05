# 管理者作成APIをOTP招待方式へ置換する設計

## 目的

`/api/pitamai/admin-create-user` が持つ以下の依存を撤廃し、完全パスワードレス運用に寄せる。

- `auth.api.createUser` の `password` 依存
- `User.mustSetPassword` フラグ依存

対象は **管理者によるユーザー追加導線**。認証方式は Email OTP を前提とする。

---

## 現状の課題

- 管理者作成時にランダムな一時パスワードを生成して `createUser` に渡している。
- 作成後に `mustSetPassword = true` を保存し、初回パスワード設定導線に依存している。
- ログインは OTP 化済みだが、オンボーディングがパスワード前提のまま。

関連実装:

- [server/api/pitamai/admin-create-user.post.ts](server/api/pitamai/admin-create-user.post.ts)
- [server/utils/auth.ts](server/utils/auth.ts)
- [prisma/schema.prisma](prisma/schema.prisma)

---

## 目標アーキテクチャ（推奨）

### 方針

1. 管理者追加時は **Authユーザーを作成しない**。
2. 代わりに「招待レコード」を発行し、招待メールを送る。
3. 初回ログイン時は Email OTP で認証し、未作成ユーザーはそのタイミングで自動作成。
4. サインイン成功フックで招待レコードを消費し、ロール等を確定する。

### この方式の利点

- 管理者APIから `password` を完全除去できる。
- `mustSetPassword` を業務フローから外せる。
- 既存の Better Auth Email OTP フローに統一できる。

---

## データモデル案

新規テーブル `AdminUserInvite` を追加する。

```prisma
model AdminUserInvite {
  id          String   @id @default(cuid())
  email       String
  role        String   @default("member")
  displayName String?
  invitedBy   String
  status      String   @default("pending") // pending | consumed | revoked | expired
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([email, status])
  @@index([expiresAt])
}
```

補足:

- `email` は大小文字差異を避けるため、保存前に `trim().toLowerCase()` する。
- 期限切れは `status=expired` へ更新、またはクエリ時に除外。

---

## API設計

## 1) 置換対象エンドポイント

既存 `POST /api/pitamai/admin-create-user` は互換維持のためルート名を維持し、意味を「招待作成」に変更する。

### Request

```json
{
  "email": "user@example.com",
  "name": "山田 太郎",
  "role": "member"
}
```

### Response

```json
{
  "created": true,
  "invite": {
    "id": "inv_xxx",
    "email": "user@example.com",
    "role": "member",
    "expiresAt": "2026-03-12T00:00:00.000Z"
  }
}
```

### 処理仕様

1. `assertActiveMemberRole(event, ['admins', 'owner'])`
2. バリデーション
3. 既存ユーザー確認（`prisma.user.findUnique({ email })`）
4. `AdminUserInvite` を upsert
   - 既存 `pending` があれば再送扱い
5. 招待メール送信
   - 例: `/login?invitedEmail=...`
6. 監査ログ記録

> 注: このAPIでは `auth.api.createUser` を呼ばない。

---

## 認証フローの変更点

### Better Auth設定

- `emailOTP.disableSignUp` を `false` へ変更（初回OTPサインイン時の自動作成を許可）

対象: [server/utils/auth.ts](server/utils/auth.ts)

### OTP送信制御

`sendVerificationOTP({ email, type })` の `type === 'sign-in'` 判定を以下へ変更:

- 許可条件: `既存ユーザー OR 有効なpending招待`
- どちらも無い場合: 現行どおり 400 を返す

これにより、`disableSignUp: false` にしても公開サインアップ化を抑止できる。

### サインイン後フック

`hooks.after`（既存）に招待消費ロジックを追加。

1. `newSession.user.email` で `pending` 招待を検索
2. 有効なら:
   - `prisma.user.update` で `role` と `name`（未設定時のみ）を適用
   - 招待 `status=consumed`, `consumedAt=now`
   - 監査ログ `ADMIN_INVITE_CONSUMED`

---

## 画面/UX変更

対象: [app/pages/apps/admin/account-add.vue](app/pages/apps/admin/account-add.vue)

- 成功トースト文言を「招待を送信しました（OTPで初回ログイン）」へ変更
- 「初回パスワード設定が必要」の文言を削除
- APIレスポンス型を `user` から `invite` へ変更

---

## 段階移行計画

### Phase 1（互換期間）

1. `AdminUserInvite` 追加
2. `admin-create-user` の内部実装を招待作成へ変更
3. 管理画面文言更新
4. OTP送信条件を「既存ユーザー or 招待あり」に変更
5. `disableSignUp: false` を有効化

### Phase 2（後方互換整理）

1. `mustSetPassword` 参照箇所削除
2. `User.mustSetPassword` カラム削除（Prisma migration）
3. パスワード設定ページ/リセットページの運用停止（必要ならアーカイブ）

---

## 監査ログ案

- `ADMIN_INVITE_USER_CREATED`
- `ADMIN_INVITE_USER_RESENT`
- `ADMIN_INVITE_USER_REVOKED`
- `ADMIN_INVITE_CONSUMED`
- `ADMIN_INVITE_USER_FAILURE`

`details` には `email`, `role`, `inviteId`, `expiresAt` を格納する。

---

## エラー設計

- 422: 入力不正
- 403: 権限不足
- 409: 既存の有効招待があり、再送禁止ポリシー時
- 500: 招待作成/メール送信失敗

ユーザー向けメッセージは「処理に失敗しました。時間をおいて再試行してください。」を基本にし、内部詳細はログのみへ出す。

---

## 未確定事項（実装前に決定）

1. 招待有効期限（推奨: 72時間）
2. 既存ユーザーへの再招待時ポリシー（role上書き可否）
3. 招待メールの再送間隔制限（レート制限）
4. 招待リンク経由でなく、メール入力だけでOTPログイン可能にするか

---

## 受け入れ条件（DoD）

- 管理者作成APIの実装から `password` と `mustSetPassword` 書き込みが消える
- 管理者追加後、対象ユーザーは OTP ログインだけで初回利用開始できる
- 招待なしメールでは OTP 送信が拒否される
- 監査ログで「招待作成→招待消費」の追跡ができる
