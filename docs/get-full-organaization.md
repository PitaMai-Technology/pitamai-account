# `authClient.useActiveOrganization()` の代替対応

## 背景と問題点

Better Auth の `authClient.useActiveOrganization()` フックは、内部的に `get-full-organization` エンドポイントを使用します。
本プロジェクトでは、セキュリティ強化のため `get-full-organization` エンドポイントのアクセス権限を **Admin** および **Owner** ロールのみに制限しました（`server/api/auth/organization/get-full-organization.get.ts`）。

その結果、**Member** ロールのユーザーが `useActiveOrganization()` を使用しているページ（ダッシュボードや組織切り替えコンポーネントなど）にアクセスすると、権限エラー（403 Forbidden）が発生したり、組織情報が取得できないという問題が発生しました。

## 対応策

`get-full-organization` を叩かずに、クライアントサイドで既に持っている情報から「アクティブな組織」を特定する代替フック `useActiveOrg` を作成しました。

### 新しいフック: `useActiveOrg`

このフックは以下の情報を組み合わせてアクティブな組織を特定します：

1. `authClient.useSession()`: セッション情報に含まれる `activeOrganizationId` を取得。
2. `authClient.useListOrganizations()`: ユーザーが所属する組織一覧を取得。

これらを照合することで、追加の API コール（特に権限が必要なもの）を行うことなく、アクティブな組織オブジェクトを返します。

#### 実装コード (`app/composable/useActiveOrg.ts`)

```typescript
import { authClient } from '~/composable/auth-client';

/**
 * authClient.useActiveOrganization() の代替フック。
 *
 * オリジナルの useActiveOrganization() は get-full-organization エンドポイントを叩くため、
 * 権限のないメンバーが使用するとエラーになる場合があります。
 *
 * このフックは useSession (activeOrganizationId) と useListOrganizations を組み合わせて
 * クライアントサイドでアクティブな組織を特定するため、追加の権限を必要としません。
 */
export const useActiveOrg = () => {
  const session = authClient.useSession();
  const organizations = authClient.useListOrganizations();

  return computed(() => {
    // session や organizations のデータ構造に合わせてアクセス
    const activeId = session.data.value?.session?.activeOrganizationId;
    const orgs = organizations.data.value;

    const data =
      activeId && orgs ? orgs.find(org => org.id === activeId) || null : null;

    return {
      data,
      isPending: session.isPending.value || organizations.isPending.value,
      error: session.error.value || organizations.error.value,
    };
  });
};
```

## 変更箇所一覧

以下のファイルで `authClient.useActiveOrganization()` を `useActiveOrg()` に置き換えました。

1.  **`app/composable/useOrg.ts`**
    - 組織切り替えロジック内で、現在のアクティブ組織の判定に使用。
2.  **`app/components/AppOrganaizationCheck.vue`**
    - 組織切り替え UI での現在選択中の組織表示に使用。
3.  **`app/composable/useOrgRoleChecks.ts`**
    - ロール判定ロジック内で使用。
4.  **`app/pages/apps/admin/member.vue`**
    - メンバー管理画面での組織ID取得に使用。
5.  **`app/pages/apps/admin/member-add.vue`**
    - メンバー招待画面での組織ID取得に使用。
6.  **`app/pages/apps/organization/[id].vue`**
    - 組織詳細ページでの表示に使用。

これにより、一般メンバー権限でもエラーなく画面が表示・操作できるようになりました。
