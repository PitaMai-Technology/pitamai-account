# server/utils/authorize.ts の使い方メモ

Better Auth の organization プラグインで定義したロール / パーミッションを、
サーバー側 API から共通的にチェックするためのヘルパー群です。

このファイルのゴール:

- 「どの API でも同じ書き方で認可チェックができるようにする」
- 実装者が毎回 `auth.api.getActiveMemberRole` や `auth.api.hasPermission` を
  直接叩かなくて良いようにする

---

## 提供されている関数

```ts
import type { H3Event } from 'h3';

// 1. ロールベースのチェック（activeOrganization 前提）
export async function assertActiveMemberRole(
  event: H3Event,
  allowedRoles: ('member' | 'admin' | 'owner')[]
): Promise<'member' | 'admin' | 'owner'>;

// 2. permissions ベースのチェック（AND 条件）
export async function assertHasPermission(
  event: H3Event,
  permissions: Record<string, string[]>
): Promise<void>;

// 3. permissions ベースのチェック（OR 条件）
export async function assertHasAnyPermission(
  event: H3Event,
  candidates: Record<string, string[]>[]
): Promise<void>;
```

### 1. `assertActiveMemberRole`

- 役割: **アクティブ組織における自分のロールが指定されたロール配列に含まれているか** をチェックします。
- 内部では `auth.api.getActiveMemberRole({ headers })` を呼び、
  - 該当ロールでなければ `403 / 管理者権限が必要です` を throw します。

**典型的な使い方（admin/owner ガード）**

```ts
import { assertActiveMemberRole } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  // admin か owner 以外は 403
  await assertActiveMemberRole(event, ['admin', 'owner']);

  // ここから下は admin / owner だけが実行可能
});
```

### 2. `assertHasPermission`（permissions AND 判定）

- 役割: Better Auth の Access Control (`auth.api.hasPermission`) を使って、
  **特定リソースの複数アクションをすべて満たしているか** をチェックします。（AND）
- 引数 `permissions` の形は、Better Auth の `statement` に対応した形に揃えます。

**例: project の `create` と `update` の両方が必要な場合**

```ts
import { assertHasPermission } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  await assertHasPermission(event, {
    project: ['create', 'update'],
  });

  // project: create + update の権限を持つユーザーだけが通る
});
```

### 3. `assertHasAnyPermission`（permissions OR 判定）

- 役割: 複数パターンの `permissions` 候補のうち、
  **1つでも `assertHasPermission` をパスしたら OK** という OR 条件を作るためのヘルパーです。
- 内部実装イメージ:
  - `candidates` を 1 件ずつ `assertHasPermission` に渡してチェック
  - どれか 1 件でも成功したら return
  - 全て失敗したら最後に `403 / 操作する権限がありません` を throw

**例: `project: ['share']` か `project: ['update']` のどちらか片方があれば OK**

```ts
import { assertHasAnyPermission } from '~~/server/utils/authorize';

export default defineEventHandler(async event => {
  await assertHasAnyPermission(event, [
    { project: ['share'] },
    { project: ['update'] },
  ]);

  // share か update のどちらかを持つユーザーだけが通る
});
```

**例: 「project: create」 or 「organization: update」のどちらかを許可したい場合**

```ts
await assertHasAnyPermission(event, [
  { project: ['create'] },
  { organization: ['update'] },
]);
```

---

## 設計上の考え方メモ

- UI 側では `authClient.organization.checkRolePermission` を使って、
  「ロール → パーミッション」の同期判定を行います（メニュー表示制御など）。
- サーバー側では必ず:
  - ロールでざっくり絞る (`assertActiveMemberRole`)
  - さらに必要に応じてパーミッションで細かく絞る
    (`assertHasPermission` / `assertHasAnyPermission`)
    という二段構えにしておくと安全です。
- `assertHasPermission` / `assertHasAnyPermission` は Better Auth の
  `auth.api.hasPermission` をラップしているだけなので、Access Control の設定を
  変えた場合でも、このレイヤーを通すことで API 実装側の書き換えを最小限にできます。
