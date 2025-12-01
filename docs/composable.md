# Composable Functions

アプリケーションで使用される主要なコンポーザブル関数のドキュメントです。

## 組織・権限関連

### `useActiveOrg`

**パス:** `app/composable/useActiveOrg.ts`

Better Auth の `authClient.useActiveOrganization()` の代替として使用されるフックです。

- **目的:**
  - オリジナルの `useActiveOrganization()` は `get-full-organization` エンドポイントを使用するため、管理者権限がないユーザーが使用すると 403 エラーが発生する問題を回避します。
- **仕組み:**
  - `authClient.useSession()` から `activeOrganizationId` を取得。
  - `authClient.useListOrganizations()` から組織一覧を取得。
  - これらをクライアントサイドで照合し、アクティブな組織オブジェクトを返します。
- **戻り値:**
  - `ComputedRef<{ data: Organization | null, isPending: boolean, error: any }>`

### `useOrg`

**パス:** `app/composable/useOrg.ts`

組織の切り替え操作を管理するコンポーザブルです。

- **主な機能:**
  - `switchOrganization(organizationId: string)`: 指定された組織IDにアクティブ組織を切り替えます。
- **処理フロー:**
  1.  組織一覧を取得し、ターゲットの組織が存在するか確認。
  2.  現在のアクティブ組織と異なる場合、`authClient.organization.setActive` を呼び出して切り替え。
  3.  成功時、トースト通知を表示。
  4.  失敗時や無効なIDの場合、ダッシュボードへリダイレクト。

### `useOrgRole` (ファイル名: `useOrgRoleChecks.ts`)

**パス:** `app/composable/useOrgRoleChecks.ts`

現在の組織におけるユーザーのロールと権限を管理します。

- **主な機能:**
  - **ロール取得:** `authClient.organization.getActiveMember()` を使用して現在のロール（owner, admin, member）を取得。
  - **権限チェック:** `canAccessAdmin` プロパティで、管理画面へのアクセス権限（例: `project: ['share']`）があるか判定。
  - **状態管理:** `isRoleResolved` フラグにより、ロール判定が完了したかどうかを提供（リダイレクト制御などで使用）。
- **自動更新:**
  - アクティブな組織が変更された場合、自動的にロール情報を再取得します。
- **戻り値:**
  - `role`: 現在のロール。
  - `canAccessAdmin`: 管理者権限の有無 (Boolean)。
  - `isRoleResolved`: ロール判定完了フラグ。
  - `fetchActiveMemberRole`: 手動でロールを再取得する関数。
