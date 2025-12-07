# Confirm Modal / useConfirmDialog

共通の確認モーダルコンポーネントと、その挙動を制御するコンポーザブルの仕様と使用例です。

## コンポーネント: `TheConfirmModal`

**パス:** `app/components/TheConfirmModal.vue`

Nuxt UI の `UModal` をラップした、シンプルな確認ダイアログコンポーネントです。

- **props**
  - `open: boolean` — モーダルの開閉状態。
  - `title?: string` — モーダルタイトル。省略時は`確認`。
  - `message: string` — 本文に表示するメッセージ。
- **emits**
  - `'update:open': boolean` — v-model 用の開閉イベント。
  - `confirm` — 「はい」ボタン押下時に発火。
  - `cancel` — 「キャンセル」押下 or モーダルクローズ時に発火。

レイアウト/デザインは Nuxt UI v4 の `UModal` / `UButton` を使用した、最小限の構成です。

---

## コンポーザブル: `useConfirmDialog`

**パス:** `app/composable/useConfirmDialog.ts`

アプリ全体で共通して使える「確認モーダル」の状態とロジックを提供します。

### 役割

- `TheConfirmModal` と組み合わせて、Promise ベースの確認ダイアログ API を提供する。
- 「送信確認」と「ページ離脱時の確認」で、**異なるメッセージ**を表示できるようにする。
- 任意のページで、**無条件に離脱ガードを有効化**できる（読み込まなければ一切動作しない）。

### 戻り値

````ts
const {
	open,
	message,
	confirm,
	resolve,
	registerPageLeaveGuard,
} = useConfirmDialog();
``

- `open: Ref<boolean>`
	- モーダルの開閉状態。`TheConfirmModal` の `:open` にバインドします。
- `message: Ref<string>`
	- モーダル本文に表示するメッセージ。`TheConfirmModal` の `:message` にバインドします。
- `confirm(customMessage?: string): Promise<boolean>`
	- 任意のメッセージで確認モーダルを表示し、ユーザー操作を待機します。
	- `customMessage` が指定された場合、その内容が `message` にセットされます。
	- 戻り値:
		- `true` — 「はい」が押された。
		- `false` — 「キャンセル」またはモーダルクローズ。
- `resolve(result: boolean): void`
	- 内部的に `confirm()` で待機している Promise を解決します。
	- 通常は `TheConfirmModal` 側の `@confirm` / `@cancel` から呼び出します。
- `registerPageLeaveGuard(message?: string): void`
	- **ページ単位の離脱ガード**を有効化します（この関数を呼び出したページのみ有効）。
	- 引数 `message` には、「ページ離脱時専用」のメッセージを渡します。
	- 機能:
		- ブラウザのリロード/タブクローズ等に対して `beforeunload` を設定（標準の警告ダイアログを表示）。
		- Nuxt のルート遷移時に `confirm(message)` を呼び出し、**Nuxt UI の確認モーダル**で離脱確認を行う。

---

## 使用例: 送信確認に使う

送信時だけ確認ダイアログを表示したい場合の例です。

```ts
// composable の取得
const {
	open: confirmOpen,
	message: confirmMessage,
	confirm: confirmDialog,
	resolve: resolveConfirm,
} = useConfirmDialog();

const loading = ref(false);

async function onSubmit() {
	if (loading.value) return;
	loading.value = true;

	// 送信専用メッセージ
	const confirmed = await confirmDialog('本当に実行しますか？');
	if (!confirmed) {
		loading.value = false;
		return;
	}

	// TODO: ここで実際の送信処理を行う
}
````

テンプレート側では、`TheConfirmModal` を 1 つだけ配置します。

```ts
<LazyTheConfirmModal
  :open="confirmOpen"
  title="確認"
  :message="confirmMessage"
  @confirm="() => resolveConfirm(true)"
  @cancel="() => resolveConfirm(false)"
/>
```

---

## 使用例: ページ離脱ガードとして使う

ページから戻る/別ページへ遷移/リロードしようとした際に、確認モーダルを表示する例です。

```ts
const {
  open: confirmOpen,
  message: confirmMessage,
  confirm: confirmDialog,
  resolve: resolveConfirm,
  registerPageLeaveGuard,
} = useConfirmDialog();

// ページ離脱ガードを有効化（離脱時専用メッセージ）
registerPageLeaveGuard(
  'このページから離脱すると、入力中の内容は失われます。よろしいですか？'
);

async function onSubmit(event: FormSubmitEvent<OrganizationCreateForm>) {
  if (loading.value) return;
  loading.value = true;

  // 送信時専用の確認メッセージ
  const confirmed = await confirmDialog('本当に組織を作成しますか？');
  if (!confirmed) {
    loading.value = false;
    return;
  }

  // ここで API などの実際の処理を実行
}
```

テンプレートは送信確認と同じく、共通の `TheConfirmModal` を使います。

```vue
<LazyTheConfirmModal
  :open="confirmOpen"
  title="確認"
  :message="confirmMessage"
  @confirm="() => resolveConfirm(true)"
  @cancel="() => resolveConfirm(false)"
/>
```

### 補足

- `registerPageLeaveGuard` を **呼び出さないページ**では、一切ガードは効きません（任意で読み込める仕様）。
- 同一ページ内で、送信時とページ離脱時で**異なるメッセージ**を使い分けられます。
- ブラウザのリロード/タブクローズ時はブラウザ標準の確認ダイアログが表示され、
  アプリ内のルート遷移時は Nuxt UI の `TheConfirmModal` が表示されます。
