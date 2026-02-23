# Mail Composable ドキュメント

対象ディレクトリ: `app/composable`

このドキュメントは、メール機能の UI / 状態管理に特化した Composable（Vue 3 Composition API ユーティリティ）の全体像を整理しています。
各 Composable は責務を分割し、ロジックを再利用可能な形で提供します。

## useMailMessages.ts

メール一覧の取得・表示・詳細表示に特化した Composable です。スレッド化ロジックと既読管理を統合しています。

### 定数、変数

- `ONE_DAY_MS`
  - 役割: スレッド化時の時間範囲を定義する定数（24 時間）。同一送信者・同一件名でも 24 時間を超える古い返信は別グループに分離します。

- `lastRealtimeToastAt`
  - 役割: 新着通知のトースト表示時間を記録。5 秒未満に連続通知を表示しないようスロットリングします。

- `lastKnownTopUid`
  - 役割: 前回読み込み時の最新メール UID を保持。新着メール判定時に「UID > 前回最大」で新着を検知します。

### 型

- `MailGroup`
  - 役割: スレッド化されたメールのグループ情報。`key`（ユニーク識別子）、`sender`（送信者名）、`messages`（グループ内メール配列）を保持。

- `UseMailMessagesParams`
  - 役割: composable へ渡すパラメータ型。キャッシュ参照、コレクションセッタ、ページ状態参照をすべて定義。

### 関数名

- `extractSenderAddress(from: string | null): string`
  - 役割: メール「From」ヘッダからメールアドレスを抽出します。`<addr@example.com>` 形式なら括弧内抽出、そのまま文字列なら返却。小文字に正規化。
  - 用途: スレッド化時の送信者キー生成に使用。
  - サンプルコード:
    ```ts
    const senderKey = extractSenderAddress('John Doe <john@example.com>');
    // "john@example.com"
    ```

- `isReplySubject(subject: string | null): boolean`
  - 役割: メール件名が返信（Re: / Re[2]: など）かを判定。転送（Fwd:）や通常件名は対象外。
  - 用途: スレッド化ロジックで返信スレッド候補を判定。
  - サンプルコード:
    ```ts
    isReplySubject('Re: 会議の件'); // true
    isReplySubject('Re[2]: 会議の件'); // true
    isReplySubject('Fwd: 会議の件'); // false
    ```

- `normalizeThreadSubject(subject: string | null): string`
  - 役割: メール件名から返信マーク（Re: / Re[n]:）を削除し、正規化した下書き件名を返す。同一スレッド判定の基準となる。
  - 用途: スレッド化グループ化でグループキーの一部として使用。
  - サンプルコード:
    ```ts
    normalizeThreadSubject('Re: 会議の件'); // "会議の件"
    normalizeThreadSubject('Re[3]: 会議の件'); // "会議の件"
    ```

- `isWithinOneDay(dateText: string | null): boolean`
  - 役割: メール送信日時が現在から 24 時間以内かを判定。スレッド化の時間条件として使用。
  - 用途: 古い返信スレッドと新しい返信スレッドを分離するための境界判定。
  - サンプルコード:
    ```ts
    isWithinOneDay(new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()); // true (12時間前)
    isWithinOneDay(new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()); // false (30時間前)
    ```

- `loadMessages(options?: { markOpenedAsRead?, notifyIfNew?, forceSync? }): Promise<void>`
  - 役割: フォルダ内のメール一覧を取得し、`groupedMailList` へ反映。キャッシュ・強制同期・新着通知・自動詳細表示を制御。
  - 用途: フォルダ切り替え時、手動リフレッシュ、SSE 新着検知時の一覧更新。
  - オプション:
    - `markOpenedAsRead`: true で詳細表示した最初のメールを既読化
    - `notifyIfNew`: true で新着時にトースト通知
    - `forceSync`: true でキャッシュ無視して常にサーバー同期
  - サンプルコード:

    ```ts
    // 初期読み込み: キャッシュ活用、新着なし、詳細表示なし
    await loadMessages({ markOpenedAsRead: false, notifyIfNew: false });

    // リフレッシュ: サーバー同期強制、新着通知あり
    await loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: true,
      forceSync: true,
    });
    ```

- `openMessage(uid: number, markAsRead = true): Promise<void>`
  - 役割: 指定 UID のメール詳細を取得し `currentMail` へ反映。オプションで既読化。二重取得を防止。
  - 用途: 一覧からメール詳細へ遷移時、既読状態を制御。
  - オプション:
    - `markAsRead`: true で詳細取得時に既読 API を呼び出す（通常）。false で一覧読み込みだけは既読化しない（ユーザー表示のみ）。
  - サンプルコード:

    ```ts
    // ユーザークリック: 既読化
    await openMessage(12345, true);

    // 自動一覧読み込み: 既読化スキップ
    await openMessage(12345, false);
    ```

- `maybeNotifyNewMail(): void`
  - 役割: 新着通知トースト表示。5 秒未満の連続通知はスロットリング。
  - 用途: SSE 新着イベント受信時に呼び出し。
  - サンプルコード:
    ```ts
    // SSE new-mail イベント内
    maybeNotifyNewMail(); // 最後の通知から 5 秒以上経過していれば表示
    ```

- `onToggleSeen(): Promise<void>`
  - 役割: 現在選択中のメールの既読 / 未読を切り替え、API 呼び出しして一覧更新。
  - 用途: 詳細表示中に「既読にする」「未読にする」ボタンクリック時。
  - サンプルコード:
    ```ts
    // ボタンクリック時
    await onToggleSeen(); // 既読 ↔ 未読 切り替え & リスト更新
    ```

- `groupedMailList` (computed)
  - 役割: メール一覧をスレッド化して返します。条件（同一送信者・返信判定・24h）を満たすメール群をグループ化。条件外は単独表示。
  - 用途: テンプレート で `v-for="group in groupedMailList"` として使用。
  - 返却型: `MailGroup[]`

---

## useMailFolders.ts

フォルダの表示・CRUD（作成・改名・削除）に特化した Composable です。保護フォルダの判定処理も統合。

### 定数、変数

なし

### 型

- `UseMailFoldersParams`
  - 役割: composable へ渡すパラメータ型。フォルダ参照、読み込み状態、操作状態、セッタ関数をすべて定義。

### 関数名

- `normalizeFolderPath(path: string): string`
  - 役割: フォルダパスを小文字に統一・空白トリム。
  - 用途: フォルダ比較時にサーバー実装の大文字小文字差分を吸収。
  - サンプルコード:
    ```ts
    normalizeFolderPath(' INBOX '); // "inbox"
    ```

- `getFolderDisplay(folder: MailFolder): { label, icon, protected }`
  - 役割: フォルダを UI 表示用に変換。標準フォルダ（受信箱・下書き等）は日本語表示・アイコン・保護フラグ付与。
  - 用途: フォルダ一覧の表示名・アイコン・編集可否を決定。
  - サンプルコード:
    ```ts
    const result = getFolderDisplay({ path: 'INBOX', specialUse: '\\Inbox' });
    // { label: '受信トレイ', icon: 'i-lucide-inbox', protected: true }
    ```

- `loadFolders(): Promise<void>`
  - 役割: サーバーからフォルダ一覧を取得。アクティブフォルダが削除されていれば先頭へ自動退避。
  - 用途: 初期化、アカウント切り替え時。
  - サンプルコード:
    ```ts
    await loadFolders();
    ```

- `onCreateFolder(): Promise<void>`
  - 役割: 新規フォルダ を作成。入力フィールドをクリア。成功 / エラートースト表示。
  - 用途: フォルダ編集パネルの「新規作成」ボタン。
  - サンプルコード:
    ```ts
    await onCreateFolder(); // newFolderName の値でサーバーへ POST
    ```

- `onRenameFolder(): Promise<void>`
  - 役割: 現在フォルダ を改名。保護フォルダは実行不可。ユーザー確認ダイアログあり。
  - 用途: フォルダ編集パネルの「名前変更」ボタン。
  - サンプルコード:
    ```ts
    await onRenameFolder(); // prompt で新名を取得してサーバーへ POST
    ```

- `onDeleteFolder(): Promise<void>`
  - 役割: 現在フォルダ を削除。保護フォルダは実行不可。ユーザー確認ダイアログあり。削除後はアクティブを先頭へ切り替え。
  - 用途: フォルダ編集パネルの「削除」ボタン。
  - サンプルコード:
    ```ts
    await onDeleteFolder(); // 確認後、サーバーへ DELETE、一覧更新
    ```

- `folderOptions` (computed)
  - 役割: フォルダセレクト用 UI オプション配列。各フォルダの表示名と path をマッピング。
  - 用途: `<USelect :items="folderOptions" />` で使用。

- `activeFolder`, `currentFolder` (computed)
  - 役割: 現在選択中のフォルダ参照。
  - 用途: フォルダ操作の前提チェック。

- `canEditActiveFolder` (computed)
  - 役割: 現在フォルダが編集可能（保護フォルダでない）かの真偽値。
  - 用途: 改名 / 削除ボタンの disable 制御。

- `isTrashFolder`, `isSentFolder`, `isDraftFolder` (computed)
  - 役割: 現在フォルダが特定のフォルダ（ゴミ箱 / 送信済み / 下書き）か判定。
  - 用途: メール詳細表示の UI 切り替え（削除 → 戻す、宛先表示パターン変更 等）。

---

## useMailCompose.ts

メール作成・下書き・送信に特化した Composable です。宛先入力フィールド管理と送受信 API 統合。

### 定数、変数

- `recipientTypeOptions`
  - 役割: 宛先種別（To / Cc / Bcc）のセレクトオプション配列。

### 型

- `UseMailComposeParams`
  - 役割: composable へ渡すパラメータ型。作成状態、送受信状態、下書き復元対象、セッタ関数をすべて定義。

### 関数名

- `addCcField()`, `removeCcField(index)`, `addBccField()`, `removeBccField(index)`
  - 役割: Cc / Bcc 入力フィールドの追加・削除。最後の 1 行は削除時にクリアのみ（フィールド削除しない）。
  - 用途: モーダル内の「+」「-」ボタン。
  - サンプルコード:
    ```ts
    addCcField(); // cc 行を 1 つ追加
    removeCcField(0); // 0 番目の cc 行を削除（複数行なら削除、最後なら空にする）
    ```

- `splitRecipientList(value: string | null): string[]`
  - 役割: カンマ区切りの宛先文字列を配列へ分割。下書き復元時に未 set 値なら最小 1 行の空文字列配列を返す。
  - 用途: 下書き復元時の cc / bcc パース。
  - サンプルコード:
    ```ts
    splitRecipientList('a@ex.com, b@ex.com'); // ['a@ex.com', 'b@ex.com']
    splitRecipientList(null); // ['']
    ```

- `onUseDraftForCompose()`
  - 役割: 下書きメールの詳細から作成フォーム へ復元。宛先・件名・本文・CCBcc を一括コピー。モーダル自動オープン。
  - 用途: 下書きフォルダの詳細表示時「下書きから送信」ボタン。
  - サンプルコード:
    ```ts
    // 下書きメール詳細表示中
    await onUseDraftForCompose(); // フォーム復元、モーダル open
    ```

- `toBase64(file: File): Promise<string>`
  - 役割: ファイルを DataURL 形式で読み込み、Base64 文字列を抽出。添付ファイル送信用エンコード。
  - 用途: 送信 / 下書き保存前の添付ファイル前処理。
  - サンプルコード:
    ```ts
    const base64 = await toBase64(fileInput.files[0]);
    // data:application/octet-stream;base64,iVBORw0KGgo...
    ```

- `onSendMail(): Promise<void>`
  - 役割: メール送信。宛先未設定なら即座にエラートースト。送信完了後フォーム リセット・モーダルクローズ。
  - 用途: 作成モーダルの「送信」ボタン。
  - サンプルコード:
    ```ts
    await onSendMail();
    // → 送信成功トースト → フォームリセット → モーダルクローズ
    ```

- `onSaveDraft(): Promise<void>`
  - 役割: 下書き保存。送信と同じ前処理（宛先 join・Base64 エンコード）を実施。成功時は保存先トースト表示。
  - 用途: 作成モーダルの「下書き保存」ボタン。
  - サンプルコード:
    ```ts
    await onSaveDraft();
    // → 下書き保存成功トースト（保存先表示）
    ```

---

## useMailSelection.ts

メール複数選択・ドラッグドロップ操作に特化した Composable です。Shift キー併用の複数選択・一括移動ロジック。

### 定数、変数

なし

### 型

- `UseMailSelectionParams`
  - 役割: composable へ渡すパラメータ型。複数選択 UID 配列、D&D バルク有効フラグ、D&D UID 配列をすべて定義。

### 関数名

- `onMailDragStart(payload: { uid, shiftKey }): void`
  - 役割: メールドラッグ開始時。Shift キー or 既選択項目ドラッグなら複数ドロップ用モードへ。そうでなければ単体ドラッグ。
  - 用途: メールアイテムの `@drag-start` イベント。
  - サンプルコード:
    ```ts
    // マイティプル選択済み [100, 200] + uid=200 Shift+ドラッグ
    onMailDragStart({ uid: 200, shiftKey: true });
    // → 複数移動モード ON、[100, 200] をドロップ対象
    ```

- `isUidMultiSelected(uid: number): boolean`
  - 役割: 指定 UID がマルチセレクト配列に含まれるか判定。UI 選択状態表現用。
  - 用途: テンプレートで `:multi-selected="isUidMultiSelected(uid)"` として使用。
  - サンプルコード:
    ```ts
    isUidMultiSelected(100); // multiSelectedUids に 100 が含まれていれば true
    ```

- `onMailItemClick(payload: { uid, shiftKey }): void`
  - 役割: メールアイテムクリック時。Shift なし → 選択クリア。Shift あり → トグル追加 / 削除。
  - 用途: メールアイテムの `@item-click` イベント。
  - サンプルコード:
    ```ts
    // Shift+クリック uid=300、既に選択済みなら削除
    onMailItemClick({ uid: 300, shiftKey: true });
    // → 300 を multiSelectedUids から削除
    ```

- `resolveDropTargetUids(uid: number): number[]`
  - 役割: ドロップ対象の UID 配列を決定。複数ドロップモードあれば複数 UID 返却、さもなくば単体 UID 返却。
  - 用途: ドロップイベント時に実際に移動するメール UID を確定。
  - サンプルコード:

    ```ts
    // 複数モード ON、ドロップ UID=500
    resolveDropTargetUids(500); // [100, 200, 500] → 3 件移動

    // 複数モード OFF
    resolveDropTargetUids(500); // [500] → 1 件移動
    ```

- `resetSelectionAfterDrop(): void`
  - 役割: ドロップ完了後、選択状態を完全リセット。次回の誤選択操作を防ぐ。
  - 用途: ドロップ処理の最後（finally ブロック）で呼び出し。
  - サンプルコード:
    ```ts
    try {
      // ドロップ処理
    } finally {
      resetSelectionAfterDrop(); // 複数選択リセット
    }
    ```

---

## useMailRealtime.ts

SSE（Server-Sent Events）接続管理に特化した Composable です。新着検知・再接続ロジック・バックオフ戦略。

### 定数、変数

- `streamConnected`
  - 役割: SSE 接続状態を表す真偽値。

### 型

- `UseMailRealtimeParams`
  - 役割: composable へ渡すパラメータ型。接続設定、設定有無判定、Stream URL 生成関数、新着受信コールバックをすべて定義。

### 関数名

- `startRealtimeStream(): void`
  - 役割: SSE 接続開始。クライアント実行環境かつ設定有効かつ未接続の場合のみ接続。heartbeat / connected / ready / new-mail イベント監視。error で自動再接続（バックオフ付き）。
  - 用途: ページ初期化、アカウント設定有効化時。
  - サンプルコード:
    ```ts
    watch(hasMailSetting, enabled => {
      if (!enabled) stopRealtimeStream();
      else startRealtimeStream();
    });
    ```

- `stopRealtimeStream(): void`
  - 役割: SSE 接続終了。再接続タイマーもキャンセル。
  - 用途: ページ破棄、アカウント設定無効化時。
  - サンプルコード:
    ```ts
    onBeforeUnmount(() => {
      stopRealtimeStream();
    });
    ```

- `streamConnected` (ref)
  - 役割: SSE 接続状態をリアクティブに保持。
  - 用途: テンプレートで接続インジケータ表示。

---

## useMailApi.ts

メール API クライアント統合。すべてのサーバー API エンドポイントを呼び出し関数として提供。

（詳細はドキュメント省略。基本的に各 API 呼び出しをラップし、型安全性を確保。）

---

## useMailComposable 全体の利用フロー

1. **ページ初期化**: `useMailFolders`, `useMailMessages` 呼び出し → フォルダ・メール一覧取得
2. **SSE 接続開始**: `useMailRealtime.startRealtimeStream()` → 新着イベント待機
3. **ユーザー操作**:
   - フォルダ切り替え → `loadMessages()` 呼び出し
   - メールクリック → `openMessage()` 呼び出し
   - 作成 → `useMailCompose` で送信 / 下書き
   - 複数選択・D&D → `useMailSelection` で対象 UID 確定
4. **ページ破棄**: `stopRealtimeStream()` → SSE 接続終了

---
