<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useOrgRoleStore } from '~/stores/orgRole';
import { useMailStore } from '~/stores/mail';
import { useConfirmDialogStore } from '~/stores/confirmDialog';
import { useMailApi } from '~/composable/useMailApi';
import { useMailFolders } from '~/composable/useMailFolders';

defineProps<{
  collapsed?: boolean;
}>();

const tabs = [
  {
    label: 'メール',
    icon: 'i-lucide-mail',
    slot: 'mail',
  },
  {
    label: '設定',
    icon: 'i-lucide-user',
    slot: 'settings',
  }
];

const items = ref([
  {
    label: 'ホーム',
    icon: 'i-lucide-home',
    to: '/apps/dashboard',
  },
  {
    label: '設定',
    icon: 'i-lucide-user',
    to: '/apps/users/settings',
  },
]);

const mailItems = [
  {
    label: 'メール',
    icon: 'i-lucide-inbox',
    to: '/apps/mail',
  },
]

const adminItems = [
  [
    {
      label: '組織ダッシュボード',
      icon: 'i-lucide-crown',
      children: [
        {
          label: '組織作成',
          icon: 'i-lucide-plus-circle',
          to: '/apps/admin/organization/create-organization',
        },
        {
          label: '組織情報更新',
          icon: 'i-lucide-edit',
          to: '/apps/admin/organization/organization-update',
        },
        {
          label: '組織削除',
          icon: 'i-lucide-trash',
          to: '/apps/admin/organization/organization-delete',
        },
        {
          label: 'メンバー管理',
          icon: 'i-lucide-users',
          to: '/apps/admin/organization/member',
        },
        {
          label: 'メンバー招待',
          icon: 'i-lucide-mail-plus',
          to: '/apps/admin/organization/member-add',
        },
        {
          label: '監査ログ',
          icon: 'i-lucide-file-search',
          to: '/apps/admin/audit',
        },
      ],
    },
    {
      label: '全体のアカウント管理',
      icon: 'i-lucide-user-round-cog',
      children: [
        {
          label: 'アカウント一覧',
          icon: 'i-lucide-list',
          to: '/apps/admin/account',
        },
        {
          label: 'アカウント追加',
          icon: 'i-lucide-user-plus',
          to: '/apps/admin/account-add',
        },
        {
          label: 'アカウントの情報更新',
          icon: 'i-lucide-edit-2',
          to: '/apps/admin/user-update',
        },
        {
          label: 'アカウントのメール変更',
          icon: 'i-lucide-mail',
          to: '/apps/admin/user-change-email',
        },
      ],
    },
  ],
];

const { canAccessAdmin } = storeToRefs(useOrgRoleStore());

// メールフォルダパネル用のstate
const mailStore = useMailStore();
const mailApi = useMailApi();
const toast = useToast();
const confirmStore = useConfirmDialogStore();
const { open: confirmOpen, message: confirmMessage } = storeToRefs(confirmStore);
const { confirm: confirmDialog, resolve: resolveConfirm } = confirmStore;

const {
  activeFolderPath,
  folders,
  selectedUid,
  isLoading,
  creatingFolder,
  folderActionLoading,
  newFolderName,
} = storeToRefs(mailStore);

const hasMailSetting = computed(() => !!activeFolderPath.value);

// フォルダ関連ロジック
const {
  canEditActiveFolder,
  getFolderDisplay,
  loadFolders,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
} = useMailFolders({
  hasMailSetting,
  activeFolderPath,
  folders,
  isLoading,
  creatingFolder,
  folderActionLoading,
  newFolderName,
  setFolders: mailStore.setFolders,
  setActiveFolder: mailStore.setActiveFolder,
});

// フォルダ選択ハンドラー（別ページにいても自動的にメールページへ遷移）
async function onSelectFolder(folderPath: string) {
  mailStore.setActiveFolder(folderPath);
  await navigateTo('/apps/mail');
}

// メール移動ハンドラー
async function onDropMailToFolder(uids: number[], toFolderPath: string) {
  if (!activeFolderPath.value) return;
  if (activeFolderPath.value === toFolderPath) return;

  const fromFolderPath = activeFolderPath.value;
  const targetUids = Array.from(new Set(uids));

  if (targetUids.length === 0) return;

  if (targetUids.length > 1) {
    const confirmed = await confirmDialog(
      `${targetUids.length}件のメールを「${toFolderPath}」へ移動しますか？`
    );

    if (!confirmed) {
      return;
    }
  }

  try {
    for (const uid of targetUids) {
      await mailApi.moveToFolder(uid, fromFolderPath, toFolderPath);
    }

    const response = await mailApi.getMessages({
      folder: fromFolderPath,
      limit: 50,
      forceSync: true,
    });

    mailStore.setMailList(response.messages);

    if (selectedUid.value !== null && targetUids.includes(selectedUid.value)) {
      mailStore.selectUid(null);
      mailStore.setCurrentMail(null);
    }

    toast.add({
      title: '移動しました',
      description:
        targetUids.length > 1
          ? `${targetUids.length}件のメールをフォルダへ移動しました`
          : 'メールをフォルダへ移動しました',
      color: 'success',
    });
  } catch (error) {
    toast.add({
      title: '移動失敗',
      description: error instanceof Error ? error.message : 'メール移動に失敗しました',
      color: 'error',
    });
  }
}


</script>

<template>
  <div>
    <div class="mb-6">
      <AppOrganaizationCheck />
    </div>
    <UTabs :items="tabs" class="gap-5" variant="link" color="info">
      <template #settings>
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" />

        <template v-if="canAccessAdmin">
          <USeparator class="my-4" label="管理者のみ" />
          <UNavigationMenu :collapsed="collapsed" :items="adminItems" orientation="vertical" />
        </template>

      </template>
      <template #mail>
        <UNavigationMenu :collapsed="collapsed" :items="mailItems" orientation="vertical" />
        <USeparator class="mt-2 mb-8" />
        <AppMailFolderPanel :folders="folders" :active-folder-path="activeFolderPath" :new-folder-name="newFolderName"
          :creating-folder="creatingFolder" :folder-action-loading="folderActionLoading"
          :can-edit-active-folder="canEditActiveFolder" :get-folder-display="getFolderDisplay" @select="onSelectFolder"
          @drop-mail="onDropMailToFolder" @create-folder="onCreateFolder" @rename-folder="onRenameFolder"
          @delete-folder="onDeleteFolder" @update:new-folder-name="newFolderName = $event" />
      </template>
    </UTabs>
  </div>

  <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
    @cancel="() => resolveConfirm(false)" />
</template>
