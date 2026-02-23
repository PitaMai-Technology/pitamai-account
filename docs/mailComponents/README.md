# Mail Components ドキュメント

対象ディレクトリ: `app/components/App`

このドキュメントは、メール UI コンポーネントの全体像を整理しています。
各コンポーネントはフォルダ・一覧・詳細・作成モーダル、およびメール表示ユーティリティを提供。

---

## MailFolderPanel.vue

### 役割

フォルダ一覧パネル。フォルダ表示・選択・CRUD（作成・改名・削除）操作を提供。

### 定数、変数

なし

### 型

- Props: `{ folders, activeFolderPath, newFolderName, creatingFolder, folderActionLoading, canEditActiveFolder, getFolderDisplay }`
- Emits: `{ select, dropMail, createFolder, renameFolder, deleteFolder, 'update:newFolderName' }`

### コンポーネント主要機能

- **フォルダ表示**: `AppMailDroppableFolder` ループで各フォルダを表示
- **フォルダ選択**: `@select` イベントで親へ通知
- **D&D ドロップ**: `@drop-mail` イベント
- **フォルダ編集パネル（UCollapsible）**:
  - 新規フォルダ入力 + 作成ボタン
  - 改名ボタン（保護フォルダ disabled）
  - 削除ボタン（保護フォルダ disabled）

### 使用例

```vue
<AppMailFolderPanel
  :folders="folders"
  :active-folder-path="activeFolderPath"
  :new-folder-name="newFolderName"
  :creating-folder="creatingFolder"
  :folder-action-loading="folderActionLoading"
  :can-edit-active-folder="canEditActiveFolder"
  :get-folder-display="getFolderDisplay"
  @select="setActiveFolder"
  @drop-mail="onDropMailToFolder"
  @create-folder="onCreateFolder"
  @rename-folder="onRenameFolder"
  @delete-folder="onDeleteFolder"
  @update:new-folder-name="newFolderName = $event"
/>
```

---

## MailListPanel.vue

### 役割

メール一覧パネル。スレッド化グループ表示・複数選択・ドラッグ開始・更新機能を提供。

### 定数、変数

なし

### 型

- Props: `{ isLoading, mailList, groupedMailList, selectedUid, openingUid, isUidMultiSelected }`
- Emits: `{ refresh, open, dragStart, itemClick }`

### コンポーネント主要機能

- **読み込み状態**: スケルトン表示 / 空状態 / 一覧
- **グループ化表示**: `groupedMailList` をループ
- **返信履歴展開**: UCollapsible で返信スレッド表示
- **アイテムクリック / ドラッグ**: `AppMailDraggableItem` の emit へ応答

### 使用例

```vue
<AppMailListPanel
  :is-loading="isLoading"
  :mail-list="mailList"
  :grouped-mail-list="groupedMailList"
  :selected-uid="selectedUid"
  :opening-uid="openingUid"
  :is-uid-multi-selected="isUidMultiSelected"
  @refresh="
    loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: false,
      forceSync: true,
    })
  "
  @open="uid => openMessage(uid, true)"
  @drag-start="onMailDragStart"
  @item-click="onMailItemClick"
/>
```

---

## MailDetailPanel.vue

### 役割

メール詳細表示パネル。件名・メタデータ・本文・添付ファイル・操作ボタン（既読・アーカイブ・削除・復元等）を表示。

### 定数、変数

なし

### 型

- Props: `{ selectedMessage, currentMail, messageMetaLabel, messageMetaValue, isSentFolder, messageCcValue, hasSelectedMail, selectedSeen, isDraftFolder, isTrashFolder }`
- Emits: `{ toggleSeen, move, useDraftCompose }`

### コンポーネント主要機能

- **メールヘッダー**: 件名・送信者・Cc 表示
- **操作ボタン**:
  - 既読 / 未読 切り替え
  - アーカイブ
  - 削除
  - 下書き復元（下書きフォルダ時のみ）
  - 復元（ゴミ箱フォルダ時のみ）
- **添付ファイル表示**: ファイル名・サイズ掲載
- **本文表示**: `AppMailBody` コンポーネント で HTML / テキスト レンダリング

### 使用例

```vue
<AppMailDetailPanel
  :selected-message="selectedMessage"
  :current-mail="currentMail"
  :message-meta-label="messageMetaLabel"
  :message-meta-value="messageMetaValue"
  :is-sent-folder="isSentFolder"
  :message-cc-value="messageCcValue"
  :has-selected-mail="hasSelectedMail"
  :selected-seen="selectedSeen"
  :is-draft-folder="isDraftFolder"
  :is-trash-folder="isTrashFolder"
  @toggle-seen="onToggleSeen"
  @move="onMove"
  @use-draft-compose="onUseDraftForCompose"
/>
```

---

## MailComposeModal.vue

### 役割

メール作成モーダル。宛先種別切り替え・宛先入力フィールド管理・本文・添付ファイル・送信 / 下書き保存機能を提供。

### 定数、変数

なし

### 型

- Props: `{ composeOpen, recipientType, recipientTypeOptions, composeState, draftSaving, sending }`
- Emits: `{ 'update:composeOpen', 'update:recipientType', addCcField, removeCcField, addBccField, removeBccField, saveDraft, sendMail }`

### コンポーネント主要機能

- **モーダル ウィンドウ**: UModal でオーバーレイ表示
- **宛先種別セレクト**: To / Cc / Bcc 切り替え
- **宛先イテムフィールド**:
  - To: 1 行（常に表示）
  - Cc: 複数行（+ / - ボタンで追加・削除）
  - Bcc: 複数行（+ / - ボタンで追加・削除）
- **件名入力**: UInput
- **本文 textarea**: UTextarea（複数行対応）
- **添付ファイル**: UFileUpload（複数ファイル対応）
- **フッターボタン**:
  - キャンセル: モーダル閉じる
  - 下書き保存: 送信せず保存
  - 送信: メール送信

### 使用例

```vue
<AppMailComposeModal
  :compose-open="composeOpen"
  :recipient-type="recipientType"
  :recipient-type-options="recipientTypeOptions"
  :compose-state="composeState"
  :draft-saving="draftSaving"
  :sending="sending"
  @update:compose-open="composeOpen = $event"
  @update:recipient-type="recipientType = $event"
  @add-cc-field="addCcField"
  @remove-cc-field="removeCcField"
  @add-bcc-field="addBccField"
  @remove-bcc-field="removeBccField"
  @save-draft="onSaveDraft"
  @send-mail="onSendMail"
/>
```

---

## MailDraggableItem.vue

### 役割

ドラッグ可能なメールアイテム。件名・送信者・日付表示、選択状態フィードバック、ドラッグ開始イベント。

### 定数、変数

なし

### 型

- Props: `{ message, selectedUid, openingUid, multiSelected }`
- Emits: `{ open, dragStart, itemClick }`

### コンポーネント主要機能

- **アイテム表示**: 件名・送信者（左）、日付（右）
- **選択状態視覚フィードバック**: `multiSelected` で背景・ボーダー変更
- **開い状態フィードバック**: `selectedUid === message.uid` で強調表示
- **未読表示**: `!message.seen` で太字 / 背景色
- **ドラッグ開始**: `@dragstart` で Shift キー情報とともに emit
- **クリック**: Shift キー情報とともに emit

### 使用例

```vue
<AppMailDraggableItem
  :message="message"
  :selected-uid="selectedUid"
  :opening-uid="openingUid"
  :multi-selected="isUidMultiSelected(message.uid)"
  @open="openMessage"
  @drag-start="onMailDragStart"
  @item-click="onMailItemClick"
/>
```

---

## MailDroppableFolder.vue

### 役割

ドロップ可能なフォルダアイテム。フォルダ名・アイコン表示、ドロップターゲット指定、クリック選択。

### 定数、変数

なし

### 型

- Props: `{ folder, activeFolderPath, icon, label }`
- Emits: `{ select, dropMail }`

### コンポーネント主要機能

- **フォルダ表示**: アイコン + ラベル（i18n 対応）
- **選択状態表示**: `activeFolderPath === folder.path` で強調
- **クリック**: フォルダ選択（`@select` emit）
- **ドロップ**: メール ドロップ 受け取り（`@dropMail` emit、[uid, toFolderPath] タプル）
- **ドラッグ over**: 視覚フィードバック（背景変更など）

### 使用例

```vue
<AppMailDroppableFolder
  :folder="folder"
  :active-folder-path="activeFolderPath"
  :icon="getFolderDisplay(folder).icon"
  :label="getFolderDisplay(folder).label"
  @select="setActiveFolder"
  @drop-mail="(uid, path) => onDropMailToFolder(uid, path)"
/>
```

---

## MailBody.vue

### 役割

メール本文レンダリング。HTML もしくはテキスト形式での安全な表示。

### 定数、変数

なし

### 型

- Props: `{ html, text }`

### コンポーネント主要機能

- **HTML 優先**: `html` があればサニタイズして表示
- **テキストフォールバック**: `html` なければ `text` をプレーンテキスト表示（改行保持）
- **サニタイズ**: XSS 対策（isomorphic-dompurify 使用）
- **空状態**: 本文なければ「本文なし」表示

### 使用例

```vue
<AppMailBody :html="currentMail?.html" :text="currentMail?.text" />
```

---

## その他ユーティリティコンポーネント

### AsideNavigation.vue

- 役割: アプリサイドナビゲーション（メール以外の機能リンク等）

### BackgroundCard.vue

- 役割: 背景装飾カード UI

### Header.vue

- 役割: アプリページヘッダー

### LogOut.vue

- 役割: ログアウト機能

### ThinkingLoading.vue

- 役割: 考え中状態ローディング表示

---

## コンポーネント統合フロー

```
MailFolderPanel
  ├─ 選択 → setActiveFolder
  └─ ドロップ → onDropMailToFolder

MailListPanel
  ├─ リフレッシュ → loadMessages
  ├─ アイテムクリック → openMessage
  ├─ ドラッグ開始 → onMailDragStart
  └─ アイテムクリック（Shift） → onMailItemClick

MailDetailPanel
  ├─ 既読切替 → onToggleSeen
  ├─ 削除・アーカイブ → onMove
  └─ 下書き復元 → onUseDraftForCompose

MailComposeModal
  ├─ 宛先追加 → addCcField / addBccField
  ├─ 宛先削除 → removeCcField / removeBccField
  ├─ 下書き保存 → onSaveDraft
  └─ 送信 → onSendMail
```

---
