# Wiki アプリ仕様

## 概要

組織ごとに Markdown コンテンツを作成・閲覧・編集・削除できる Wiki 機能です。

- コンテンツは Markdown として保存（`contentType: "markdown"`）
- Wiki は組織に紐づく（アクティブ組織の `activeOrganizationId` が実体のスコープ）
- URL には `:id`（組織ID）が含まれるが、実際の取得/保存は **アクティブ組織** を基準に行う

---

## ルーティング

ベース: `/apps/organization/wiki/:id`

- 一覧: `/apps/organization/wiki/:id`
- 新規作成: `/apps/organization/wiki/:id/new`
- 編集: `/apps/organization/wiki/:id/:wikiId`

※ `:id` は「URL上の組織ID」だが、実際には後述の組織同期により **アクティブ組織IDへ自動的に揃う**。

---

## 組織同期（URL ⇄ Active Organization）

Wiki 配下では、URL の `:id` とセッションの `activeOrganizationId` を同期します。

### 1) 遷移時の同期（Route Middleware）

- 対象: `/apps/organization/wiki/**`
- 実装: `app/middleware/wiki-org-sync.global.ts`

挙動:

1. セッションがロードされるまで待機
2. `activeOrganizationId` が **存在** し、URL の `:id` と異なる場合
   - URL の `:id` を **activeOrganizationId に置換して replace 遷移**
3. `activeOrganizationId` が **未選択** の場合
   - URL の `:id` が自分の所属組織一覧に含まれることを確認
   - 問題なければ `setActive(organizationId = :id)` を実行し、セッション反映まで待機
   - 不正（所属していない等）の場合は `/apps/dashboard` へ遷移

### 2) 変更時の同期（Client Plugin）

- 対象: `/apps/organization/wiki/**`
- 実装: `app/plugins/wiki-org-sync.client.ts`

挙動:

- `activeOrganizationId` が変わったら、表示中の URL `:id` を **即時に activeOrganizationId へ replace**
- これにより、組織セレクタでアクティブ組織を切り替えた瞬間に URL も追従します

---

## 権限・認可

API 側で role チェックを行います（UI だけでの制御はしない）。

- 一覧取得 / 詳細取得 / 更新 / 削除: `member | admins | owner`
- 新規作成: `admins | owner`

実装例:

- `server/api/wiki/index.get.ts`: `assertActiveMemberRole(event, ['member','admins','owner'])`
- `server/api/wiki/index.post.ts`: `assertActiveMemberRole(event, ['admins','owner'])`

---

## 画面仕様

### Wiki 一覧

- ファイル: `app/pages/apps/organization/wiki/[id]/index.vue`
- 表示:
  - タイトル
  - `slug`
  - `updatedAt`（ローカル時刻表示）
- 並び順: `updatedAt` 降順（API 側でソート）

#### リフェッチ仕様

アクティブ組織が切り替わったら一覧を再取得します。

- `activeOrganizationId` が変化したら `refreshWiki()` を実行
- 初回は organizations / activeOrganization のロードが完了してから `refreshWiki()` を実行

### Wiki 新規作成

- ファイル: `app/pages/apps/organization/wiki/[id]/new.vue`
- 入力:
  - タイトル（必須）
  - 本文（Markdown）
- 保存:
  - `POST /api/wiki`
  - 成功後: `/apps/organization/wiki/:id/:wikiId` に遷移

#### エディタ

- コンポーネント: `UEditor` + `UEditorToolbar`
- ブロック並び替え: `UEditorDragHandle` を表示（ブロック単位のドラッグ操作）
- 初期値: `content` は `"\n"`（空文字で初期化に失敗するケースがあるため）

### Wiki 編集

- ファイル: `app/pages/apps/organization/wiki/[id]/[wikiId].vue`
- 初期ロード:
  - `GET /api/wiki/:wikiId` で本文を取得
  - 取得した `title/content` をフォームへ反映
- 保存:
  - `PUT /api/wiki/:wikiId`
- 削除:
  - 確認モーダルを表示してから `DELETE /api/wiki/:wikiId`
  - 成功後: `/apps/organization/wiki/:id` に遷移

#### エディタ

- `UEditorDragHandle` あり（ブロック並び替え）

---

## API 仕様（server/api/wiki）

注意: 組織スコープは **URL ではなく activeOrganizationId**（セッション）で決まります。
`requireActiveOrganizationId()` が `session.session.activeOrganizationId` を参照します。

### GET /api/wiki

- 実装: `server/api/wiki/index.get.ts`
- 認可: `member | admins | owner`
- 動作:
  - `organizationId = activeOrganizationId`
  - `Wiki` を `updatedAt desc` で取得

レスポンス（抜粋）:

```json
{
  "wikis": [{ "id": "...", "title": "...", "slug": "...", "updatedAt": "..." }]
}
```

### POST /api/wiki

- 実装: `server/api/wiki/index.post.ts`
- 認可: `admins | owner`
- バリデーション: `wikiCreateSchema`（`shared/types/wiki`）
- 動作:
  - slug 未指定なら title から slugify
  - 組織内で slug が被る場合は `-2..-50` のサフィックスでユニーク化、埋まっていればランダム
  - 監査ログ: `WIKI_CREATE`

### GET /api/wiki/:wikiId

- 実装: `server/api/wiki/[wikiId].get.ts`
- 認可: `member | admins | owner`
- 動作:
  - `id = :wikiId` かつ `organizationId = activeOrganizationId` のレコードのみ返す

### PUT /api/wiki/:wikiId

- 実装: `server/api/wiki/[wikiId].put.ts`
- 認可: `member | admins | owner`
- バリデーション: `wikiUpdateSchema`（`shared/types/wiki`）
- 動作:
  - 対象が activeOrganization スコープに無ければ 404
  - 更新フィールドは指定があったもののみ（title/slug/content/contentType）
  - 監査ログ: `WIKI_UPDATE`（before/after を details に保存）

### DELETE /api/wiki/:wikiId

- 実装: `server/api/wiki/[wikiId].delete.ts`
- 認可: `member | admins | owner`
- 動作:
  - 対象が activeOrganization スコープに無ければ 404
  - 削除後、監査ログ: `WIKI_DELETE`

---

## データモデル（Prisma）

モデル: `Wiki`（`prisma/models/wiki.prisma`）

- `organizationId`: 組織ID（必須）
- `userId`: 作成者/所有者（必須）
- `title`: タイトル（必須）
- `slug`: 組織内でユニーク（`@@unique([organizationId, slug])`）
- `content`: 本文（Markdown文字列）
- `contentType`: デフォルト `markdown`
- `createdAt` / `updatedAt`

---

## 監査ログ

以下のアクションで監査ログを記録します（`server/utils/audit`）。

- `WIKI_CREATE`
- `WIKI_UPDATE`
- `WIKI_DELETE`

---

## 既知の注意点

- エディタ（TipTap）の初期化都合で、`content` が空文字だと入力できないケースがあるため、新規作成では `"\n"` を初期値にしています。
- URL の `:id` はユーザー入力で変わり得ますが、Wiki 機能では activeOrganizationId に同期される前提です（URLの値だけで組織が切り替わることは防ぐ）。
