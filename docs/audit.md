# server/utils/audit.ts の仕様

`server/utils/audit.ts` は、サーバーサイドで「誰が・何を・どのIDに対して・どんな状態で」操作したかを、
**Prisma の `AuditLog` テーブル + Sentry + アプリの logger** に一括で記録するためのユーティリティです。

---

## 提供関数

### `recordAuditLog(params: AuditLogParams)`

- 役割: 低レベルな監査ログ記録の本体。
  - 直接 `AuditLog` に INSERT し、Sentry Breadcrumb と `logger` 出力も行います。

```ts
interface AuditLogParams {
	userId?: string;
	organizationId?: string;
	action: string;
	targetId?: string;
	details?: Record<string, unknown>;
	event?: H3Event; // IPアドレス, UserAgent 取得用
}

export const recordAuditLog = async (params: AuditLogParams) => { ... }
```

#### 主な挙動

- `event` が渡されていれば `ipAddress`, `userAgent` を自動で取得。
- `prisma.auditLog.create(...)` で DB に保存。
- Sentry に `addBreadcrumb({ category: 'audit', ... })` を追加。
- Cloud Logging で扱いやすいよう、`logger` には以下のような **構造化ログ** を出力します。
  - `event: 'audit'`
  - `audit: { userId, organizationId, action, targetId, details }`
  - `httpRequest: { requestMethod, requestUrl, userAgent, remoteIp }`（`event` が渡された場合のみ）
  - `requestId`, `traceId`（存在すれば）
- 失敗時は `logger.error` と `Sentry.captureException` を呼び出すが、**メイン処理は止めない**。

#### 想定用途

- 既に `userId` が分かっているケースで直接呼びたいとき。
- `details` に任意の JSON を詰めて柔軟に記録したいとき。

---

### `logAuditWithSession(event, params)`

- 役割: 最もよく使う高レベル関数。
  - `auth.api.getSession` で現在のログインユーザーIDを自動取得しつつ `recordAuditLog` を呼び出します。

```ts
export const logAuditWithSession = async (
	event: H3Event,
	params: {
		action: string;
		targetId?: string;
		organizationId?: string;
		details?: Record<string, unknown>;
	}
) => { ... }
```

#### 主な挙動

1. `auth.api.getSession({ headers: event.headers })` でセッション取得。
2. セッション or `session.user` がなければ何もせず return（匿名操作は記録しない）。
3. `recordAuditLog` を `userId = session.user.id` 付きで呼び出す。

#### 想定用途

- 認証された API から「誰が何をしたか」を必ず記録したい場合の標準パターン。
- 各 API は `action` / `targetId` / `details` だけ決めればよい。

---

## 使用例

### 1. 管理者ユーザー作成時のログ

ファイル: `app/pages/apps/admin/account-add.vue`（管理者導線）

```ts
// 監査ログ記録
await logAuditWithSession(event, {
  action: 'ADMIN_CREATE_USER_SUCCESS',
  targetId: user.id,
  details: {
    email: user.email,
    role: user.role ?? 'unknown(ロールなし)',
  },
});
```

- `action`: 何が起きたかを示す識別子（任意の文字列）。
- `targetId`: 対象エンティティ（ここでは新規作成されたユーザー）の ID。
- `details`: 補足情報（メールアドレスやロールなど自由に追加可）。

この1行で内部的には:

- 実行ユーザーの `userId`（= `session.user.id`）
- `targetId`（= 新規ユーザー ID）
- `details`（email/role）
- `ipAddress`, `userAgent`

に加えて、Cloud Logging 側で検索しやすいように:

- `event: 'audit'`
- `requestId`, `traceId`（ヘッダーがあれば）
- `httpRequest`（method/url/ip/userAgent）

がすべて `AuditLog` + Sentry + logger に保存されます。

---

### 2. ユーザー削除リクエストのログ

ファイル: `server/api/auth/admin/remove-user.ts`（想定）

```ts
const body = await readBody<{ userId?: string }>(event);
// ... バリデーションなど

await logAuditWithSession(event, {
  action: 'ADMIN_REMOVE_USER_REQUEST',
  targetId: body.userId,
  details: {
    source: 'auth/admin/remove-user',
  },
});
```

- これにより、「誰（admin/owner）が」「どのユーザーIDを削除しようとしたか」が記録されます。
- 実際の削除 API (`auth.api.removeUser`) が成功しても失敗しても、この操作意図は残せます。
- 必要に応じて成功/失敗で `action` を分けることも可能です:
  - `ADMIN_REMOVE_USER_SUCCESS`
  - `ADMIN_REMOVE_USER_FAILED`

---

### 3. 失敗時の監査ログ（パターン例）

`catch` の中でエラー内容を含めて記録したい場合:

```ts
} catch (e: unknown) {
	if (e instanceof Error) {
		await logAuditWithSession(event, {
			action: 'ADMIN_CREATE_USER_FAILED',
			details: {
				errorMessage: e.message,
				// body があればメールアドレスなども追加可能
				// email: parsedBody.email
			},
		});

		logger.error(e, 'Create user error');
		throw createError({ ... });
	}
	...
}
```

- `details.errorMessage` にエラーメッセージを含めることで、
  AuditLog + Sentry 側で失敗理由を後から追いやすくなります。

---

## 設計方針メモ

- `recordAuditLog` = ローレベル API。
  - 必要なら `userId` を直接指定して使うこともできる。

- `logAuditWithSession` = 「認証済み API から使う標準 API」。
  - セッションから自動的に `userId` を取得し、各エンドポイントは `action` / `targetId` / `details` だけ指定すればよい。

- 各エンドポイントの典型的な構成:
  1.  認可チェック（`assertActiveMemberRole` など）
  2.  メイン処理（Prisma / Better Auth API 呼び出し）
  3.  `logAuditWithSession(event, { action, targetId, details })` で監査ログ

- 監査ログの内容はアクション名・対象ID・詳細JSONに寄せておくことで、
  新しいユースケースでも **`audit.ts` 側はいじらずに、呼び出し箇所を増やすだけ** で対応できるようにしています。
