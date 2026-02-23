<script setup lang="ts">
/**
 * MailFolderPanel.vue
 * 
 * 役割:
 * IMAP フォルダ一覧を表示し、フォルダ選択・新規作成・改名・削除を実現します。
 * ドラッグドロップメール受け取り対応により、メール一括移動機能も提供します。
 * 
 * Props:
 * - folders: IMAP フォルダ一覧配列
 * - activeFolderPath: 現在選択中のフォルダパス（ハイライト表示用）
 * - newFolderName: 新規フォルダ名入力フィールド値
 * - creatingFolder: フォルダ作成中フラグ（ボタン loading 制御用）
 * - folderActionLoading: フォルダ改名・削除中フラグ（ボタン loading 制御用）
 * - canEditActiveFolder: 現在フォルダが編集可能か（保護フォルダ判定）
 * - getFolderDisplay: フォルダをUI表示情報へ変換する関数
 *   { label: 表示名, icon: アイコンクラス }
 * 
 * Emits:
 * - select: フォルダクリック時に親へ folder.path を通知
 * - dropMail: メールドロップ時に [uids, toFolderPath] タプルを通知
 * - createFolder / renameFolder / deleteFolder: 各操作ボタンクリック時
 * - update:newFolderName: 新規フォルダ名入力フィールド値変更時
 */
type MailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
};

const props = defineProps<{
  folders: MailFolder[];
  activeFolderPath: string;
  newFolderName: string;
  creatingFolder: boolean;
  folderActionLoading: boolean;
  canEditActiveFolder: boolean;
  getFolderDisplay: (folder: MailFolder) => {
    label: string;
    icon: string;
  };
}>();

const emit = defineEmits<{
  select: [path: string];
  dropMail: [uids: number[], toFolderPath: string];
  createFolder: [];
  renameFolder: [];
  deleteFolder: [];
  'update:newFolderName': [value: string];
}>();

const newFolderNameModel = computed({
  get: () => props.newFolderName,
  set: value => emit('update:newFolderName', value),
});
</script>

<template>
  <UCard class="lg:col-span-2">
    <template #header>
      <div class="space-y-2">
        <h2 class="text-sm font-semibold mb-2">フォルダ</h2>
      </div>
      <UCollapsible class="flex flex-col gap-2 w-fit">
        <UButton class="text-xs p-1 w-fit" label="フォルダ編集" color="neutral" variant="subtle"
          trailing-icon="i-lucide-settings" block />

        <template #content>
          <div class="flex gap-1">
            <UFieldGroup>
              <UInput v-model="newFolderNameModel" size="xs" placeholder="新規フォルダ名" />
              <UButton size="xs" icon="i-lucide-plus" :loading="creatingFolder" @click="emit('createFolder')">
              </UButton>
            </UFieldGroup>
          </div>
          <div class="flex gap-1">
            <UFieldGroup>
              <UButton size="xs" color="neutral" variant="outline" :disabled="!canEditActiveFolder"
                :loading="folderActionLoading" @click="emit('renameFolder')">
                名前変更
              </UButton>
              <UButton size="xs" color="error" variant="outline" :disabled="!canEditActiveFolder"
                :loading="folderActionLoading" @click="emit('deleteFolder')">
                削除
              </UButton>
            </UFieldGroup>
          </div>
        </template>
      </UCollapsible>
    </template>
    <div class="space-y-1">
      <AppMailDroppableFolder v-for="folder in folders" :key="folder.path" :folder="folder"
        :active-folder-path="activeFolderPath" :icon="getFolderDisplay(folder).icon"
        :label="getFolderDisplay(folder).label" @select="emit('select', $event)"
        @drop-mail="(uids, toFolderPath) => emit('dropMail', uids, toFolderPath)" />
    </div>
  </UCard>
</template>
