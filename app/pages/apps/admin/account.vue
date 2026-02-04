<script setup lang="ts">
import { h, resolveComponent } from 'vue';
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import type { OrgRole } from '~~/server/utils/authorize';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();

interface SessionUser {
  id: string;
}

interface SessionData {
  user?: SessionUser;
}

const session = ref<SessionData | null>(null);

interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role?: OrgRole | null;
  banned?: boolean | null;
  banReason?: string | null;
}

interface AdminUserSession {
  id: string;
  createdAt?: string | Date;
  expiresAt?: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  impersonatedBy?: string | null;
}

const loading = ref(false);
const users = ref<AdminUser[]>([]);
const total = ref<number | undefined>(undefined);
const tableFilter = ref('');
// フォーム状態: Limit / Offset のみ
const state = reactive({
  limit: 20,
  offset: 0,
});

const columns: TableColumn<AdminUser>[] = [
  {
    accessorKey: 'id',
    header: 'ユーザーID',
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: 'メールアドレス',
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: '名前',
  },
  {
    accessorKey: 'role',
    header: 'ロール',
  },
  {
    accessorKey: 'banned',
    header: 'BAN',
    cell: ({ row }) => (row.original.banned ? 'はい' : 'いいえ'),
  },
  {
    accessorKey: 'banReason',
    header: () => h('span', { class: 'whitespace-nowrap' }, 'BAN理由'),
    cell: ({ row }) => {
      const reason = row.original.banReason;
      if (!reason) return '-';

      const maxLen = 32;
      const isLong = reason.length > maxLen;
      const display = isLong ? `${reason.slice(0, maxLen)}....` : reason;

      if (!isLong) {
        return h(
          'span',
          {
            class: 'inline-block w-64 max-w-64 truncate align-middle',
            title: reason,
          },
          display
        );
      }

      const UPopover = resolveComponent('UPopover');
      return h(
        UPopover,
        {
          mode: 'hover',
          openDelay: 150,
          closeDelay: 80,
        },
        {
          default: () =>
            h(
              'span',
              {
                class:
                  'inline-block w-64 max-w-64 truncate align-middle cursor-help',
              },
              display
            ),
          content: () =>
            h(
              'div',
              {
                class:
                  'max-w-sm p-2 text-sm whitespace-pre-wrap break-words text-gray-700',
              },
              reason
            ),
        }
      );
    },
  },
  {
    accessorKey: 'actions',
    header: 'アクション',
    cell: ({ row }) => {
      const user = row.original as AdminUser;
      const USelect = resolveComponent('USelect');
      const UButton = resolveComponent('UButton');
      const isSelf = session.value?.user?.id === user.id;

      const roleItems: { label: string; value: OrgRole }[] = [
        { label: 'member', value: 'member' },
        { label: 'admins', value: 'admins' },
        { label: 'owner', value: 'owner' },
      ];

      // 自分自身の行では、member を選択肢から除外
      const selectableRoleItems = isSelf
        ? roleItems.filter(item => item.value !== 'member')
        : roleItems;

      return h('div', { class: 'flex items-center gap-2' }, [
        h(USelect, {
          disabled: loading.value || isSelf && user.role === 'owner', // ここは任意
          modelValue: user.role ?? 'ロールがありません。',
          'onUpdate:modelValue': (v: OrgRole) => onChangeUserRole(user, v),
          items: selectableRoleItems,
          clearable: false,
          class: 'w-36',
        }),
        h(
          UButton,
          {
            icon: 'i-lucide-monitor',
            color: 'neutral',
            variant: 'outline',
            disabled: loading.value,
            onClick: () => openSessionsModal(user),
          },
          { default: () => 'セッション' }
        ),
        h(
          UButton,
          {
            icon: user.banned ? 'i-lucide-shield-check' : 'i-lucide-ban',
            color: user.banned ? 'primary' : 'warning',
            variant: user.banned ? 'outline' : 'solid',
            disabled: loading.value || isSelf,
            onClick: () =>
              user.banned ? confirmUnbanUser(user) : openBanModal(user),
          },
          { default: () => (user.banned ? '解除' : 'BAN') }
        ),
        h(
          UButton,
          {
            icon: 'i-lucide-trash-2',
            color: 'error',
            variant: 'solid',
            disabled: loading.value || isSelf,
            onClick: () => confirmDeleteUser(user),
          },
          { default: () => '削除' }
        ),
      ]);
    },
  },
];

const sessionColumns: TableColumn<AdminUserSession>[] = [
  {
    accessorKey: 'createdAt',
    header: '作成',
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    accessorKey: 'expiresAt',
    header: '期限',
    cell: ({ row }) => formatDate(row.original.expiresAt),
  },
  {
    accessorKey: 'ipAddress',
    header: 'IP',
    cell: ({ row }) => row.original.ipAddress ?? '-',
  },
  {
    accessorKey: 'impersonatedBy',
    header: () => h('span', { class: 'whitespace-nowrap' }, '代理'),
    cell: ({ row }) => row.original.impersonatedBy ?? '-',
  },
  {
    accessorKey: 'userAgent',
    header: 'UA',
    cell: ({ row }) => {
      const ua = row.original.userAgent;
      if (!ua) return '-';

      const maxLen = 48;
      const isLong = ua.length > maxLen;
      const display = isLong ? `${ua.slice(0, maxLen)}…` : ua;

      return h(
        'span',
        {
          class: 'inline-block w-80 max-w-80 truncate align-middle',
          title: ua,
        },
        display
      );
    },
  },
];

function formatDate(value: unknown) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ja-JP');
}

async function onChangeUserRole(user: AdminUser, newRole: OrgRole) {
  if (user.role === newRole) return;

  try {
    loading.value = true;
    const { error } = await authClient.admin.setRole({
      userId: user.id,
      role: newRole,
    });

    if (error) {
      console.error('admin.setRole error:', error);
      toast.add({
        title: 'エラー',
        description: `ロール更新に失敗しました: ${error.message}`,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '成功',
      description: 'ユーザーのロールを更新しました',
      color: 'success',
    });

    await fetchUsers();
  } catch (e: unknown) {
    console.error('admin account setRole unexpected error:', e);
    toast.add({
      title: 'エラー',
      description: 'ロール更新中に予期しないエラーが発生しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function fetchUsers() {
  loading.value = true;
  try {
    console.debug('account.fetchUsers: start', { limit: state.limit, offset: state.offset, tableFilter: tableFilter.value });
    // 以前の結果をクリアして古いデータ表示を防止
    users.value = [];
    total.value = undefined;

    const query = {
      limit: Number(state.limit ?? 20),
      offset: Number(state.offset ?? 0),
    };

    const { data, error } = await authClient.admin.listUsers({
      query,
    });

    if (error) {
      console.error('admin.listUsers error:', error);
      toast.add({
        title: 'エラー',
        description: 'ユーザー一覧の取得に失敗しました',
        color: 'error',
      });
      users.value = [];
      total.value = undefined;
      return;
    }

    if (data?.users && Array.isArray(data.users)) {
      users.value = data.users as AdminUser[];
      total.value = typeof data.total === 'number' ? data.total : data.users.length;
    } else if (Array.isArray(data)) {
      users.value = data as AdminUser[];
      total.value = data.length;
    } else {
      users.value = [];
      total.value = undefined;
    }
  } catch (e: unknown) {
    console.error('admin account list error:', e);
    toast.add({
      title: 'エラー',
      description: 'ユーザー一覧の取得に失敗しました',
      color: 'error',
    });
    users.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

// デバッグ: users が変わるたびにログを出力
watch(
  users,
  () => console.debug('account.users changed', users.value?.length)
);

// 削除用のモーダル状態
const confirmOpen = ref(false);
const confirmMessage = ref('');
type ConfirmAction = 'remove' | 'unban';
const confirmAction = ref<ConfirmAction>('remove');
let pendingUser: AdminUser | null = null;

// BAN理由入力用モーダル
const banModalOpen = ref(false);
const banReasonDraft = ref('管理者によるBAN');

// セッション一覧モーダル
const sessionsModalOpen = ref(false);
const sessionsLoading = ref(false);
const sessions = ref<AdminUserSession[]>([]);
const sessionsTargetUser = ref<AdminUser | null>(null);

// セッション全削除(確認用) - セッション一覧モーダル内にネストして開く
const revokeSessionsConfirmOpen = ref(false);
const revokeSessionsLoading = ref(false);

async function fetchUserSessions(userId: string) {
  sessionsLoading.value = true;
  try {
    const data = await $fetch<any>('/api/auth/admin/list-user-sessions', {
      method: 'POST',
      body: { userId },
    });

    const list: unknown = data?.sessions ?? data;

    if (Array.isArray(list)) {
      sessions.value = list as AdminUserSession[];
    } else {
      sessions.value = [];
    }
  } catch (e: unknown) {
    console.error('admin list-user-sessions error:', e);
    toast.add({
      title: 'エラー',
      description: 'セッション一覧の取得に失敗しました',
      color: 'error',
    });
    sessions.value = [];
  } finally {
    sessionsLoading.value = false;
  }
}

async function openSessionsModal(user: AdminUser) {
  sessionsTargetUser.value = user;
  sessionsModalOpen.value = true;
  await fetchUserSessions(user.id);
}

async function revokeAllSessionsForTargetUser() {
  const user = sessionsTargetUser.value;
  if (!user) return;

  revokeSessionsLoading.value = true;
  try {
    await $fetch('/api/auth/admin/revoke-user-sessions', {
      method: 'POST',
      body: { userId: user.id },
    });

    toast.add({
      title: '削除しました',
      description: 'ユーザーのセッションをすべて削除しました',
      color: 'success',
    });

    await fetchUserSessions(user.id);
    await fetchUsers();

    revokeSessionsConfirmOpen.value = false;
  } catch (e: unknown) {
    console.error('admin revoke-user-sessions error:', e);
    toast.add({
      title: 'エラー',
      description: 'セッションの削除に失敗しました',
      color: 'error',
    });
  } finally {
    revokeSessionsLoading.value = false;
  }
}

function confirmDeleteUser(user: AdminUser) {
  pendingUser = user;
  confirmAction.value = 'remove';
  confirmMessage.value = `${user.email ?? user.id} を完全に削除します。よろしいですか？`;
  confirmOpen.value = true;
}

function openBanModal(user: AdminUser) {
  pendingUser = user;
  banReasonDraft.value = '管理者によるBAN';
  banModalOpen.value = true;
}

function confirmUnbanUser(user: AdminUser) {
  pendingUser = user;
  confirmAction.value = 'unban';
  confirmMessage.value = `${user.email ?? user.id} のBANを解除します。よろしいですか？`;
  confirmOpen.value = true;
}

async function onConfirmAction() {
  if (!pendingUser) return;
  const user = pendingUser;

  try {
    loading.value = true;

    if (confirmAction.value === 'remove') {
      const { error } = await authClient.admin.removeUser({
        userId: user.id,
      });

      if (error) {
        console.error('admin.removeUser error:', error);
        toast.add({
          title: 'エラー',
          description: 'ユーザーの削除に失敗しました',
          color: 'error',
        });
        return;
      }

      toast.add({
        title: '削除しました',
        description: 'ユーザーを削除しました',
        color: 'success',
      });
    }

    if (confirmAction.value === 'unban') {
      const { error } = await authClient.admin.unbanUser({
        userId: user.id,
      });

      if (error) {
        console.error('admin.unbanUser error:', error);
        toast.add({
          title: 'エラー',
          description: 'ユーザーのBAN解除に失敗しました',
          color: 'error',
        });
        return;
      }

      toast.add({
        title: '解除しました',
        description: 'ユーザーのBANを解除しました',
        color: 'success',
      });
    }

    await fetchUsers();
  } catch (e: unknown) {
    console.error('admin account confirm action error:', e);
    toast.add({
      title: 'エラー',
      description: '操作に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
    confirmOpen.value = false;
    pendingUser = null;
  }
}

async function submitBan() {
  if (!pendingUser) return;
  const user = pendingUser;

  const reason = banReasonDraft.value.trim() || '管理者によるBAN';

  try {
    loading.value = true;

    const { error } = await authClient.admin.banUser({
      userId: user.id,
      banReason: reason,
    });

    if (error) {
      console.error('admin.banUser error:', error);
      toast.add({
        title: 'エラー',
        description: 'ユーザーのBANに失敗しました',
        color: 'error',
      });
      return;
    }

    toast.add({
      title: 'BANしました',
      description: 'ユーザーをBANしました',
      color: 'success',
    });

    banModalOpen.value = false;
    await fetchUsers();
  } catch (e: unknown) {
    console.error('admin account ban error:', e);
    toast.add({
      title: 'エラー',
      description: 'ユーザーのBANに失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  state.limit = 20;
  state.offset = 0;
  users.value = [];
  total.value = undefined;
  // テーブルフィルタもクリア
  tableFilter.value = '';
}

onMounted(async () => {
  try {
    const { data } = await authClient.getSession();
    session.value = (data ?? null) as SessionData | null;
  } catch (e) {
    console.error('getSession error', e);
    session.value = null;
  }

  await fetchUsers();
});

async function onSubmit(event?: FormSubmitEvent<{ limit?: number; offset?: number }>) {
  event?.preventDefault?.();
  if (loading.value) return;
  await fetchUsers();
}
</script>

<template>
  <div>
    <AppBackgroundCard class="mx-auto w-full space-y-6">
      <div>
        <h1 class="text-2xl font-semibold">アカウント一覧</h1>
      </div>

      <div class="flex items-center justify-between gap-2">
        <p class="text-sm text-gray-600">
          件数:
          <span class="font-medium">{{ total ?? users.length }}</span>
        </p>
      </div>

      <UForm :state="state" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" @submit.prevent="onSubmit">
        <UFormField label="Limit">
          <UInput v-model.number="state.limit" type="number" min="1" max="100" />
        </UFormField>
        <UFormField label="Offset">
          <UInput v-model.number="state.offset" type="number" min="0" />
        </UFormField>
        <div class="md:col-span-2 flex justify-end gap-2">
          <UButton type="submit" color="primary" :loading="loading">検索</UButton>
          <UButton variant="ghost" @click.prevent="resetForm">リセット</UButton>
        </div>
      </UForm>

      <div v-if="users.length" class="mt-4 mb-2 flex items-center gap-2 justify-between">
        <UInput v-model="tableFilter" placeholder="テーブル全体を検索..." class="flex-1 max-w-md" />
        <UButton variant="ghost" :disabled="!tableFilter" label="検索クリア" @click.prevent="tableFilter = ''" />
      </div>

      <div class="overflow-auto mt-2">
        <UTable :key="users.length" v-model:global-filter="tableFilter" :data="users" :columns="columns"
          :loading="loading" empty="ユーザーが見つかりません。" class="table-fixed" :ui="{ td: 'break-words' }" />
      </div>
      <TheConfirmModal v-model:open="confirmOpen" :message="confirmMessage" @confirm="onConfirmAction" />

      <UModal v-model:open="sessionsModalOpen" scrollable title="セッション一覧"
        :description="sessionsTargetUser?.email ?? sessionsTargetUser?.id ?? ''" :ui="{ footer: 'justify-end' }"
        class="max-w-4xl">
        <template #body>
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm text-gray-600">
                件数:
                <span class="font-medium">{{ sessions.length }}</span>
              </p>
              <UButton variant="ghost" size="sm" :loading="sessionsLoading" :disabled="!sessionsTargetUser"
                @click="sessionsTargetUser && fetchUserSessions(sessionsTargetUser.id)">
                更新
              </UButton>
            </div>

            <div v-if="sessionsLoading" class="py-8 flex items-center justify-center">
              <TheLoader />
            </div>

            <div v-else class="overflow-x-auto">
              <UTable :data="sessions" :columns="sessionColumns" empty="セッションが見つかりません。" class="table-fixed"
                :ui="{ td: 'break-words' }" />
            </div>
          </div>
        </template>

        <template #footer="{ close }">
          <UButton variant="ghost" :disabled="sessionsLoading" @click="close()">閉じる</UButton>
          <UButton color="error" :disabled="sessionsLoading || !sessionsTargetUser"
            @click="revokeSessionsConfirmOpen = true">
            全セッション削除
          </UButton>

          <UModal v-model:open="revokeSessionsConfirmOpen" title="確認" :ui="{ footer: 'justify-end' }">
            <template #body>
              {{ (sessionsTargetUser?.email ?? sessionsTargetUser?.id ?? '') + ' のセッションをすべて削除します。よろしいですか？' }}
            </template>

            <template #footer="{ close: closeConfirm }">
              <UButton variant="ghost" :disabled="revokeSessionsLoading" @click="closeConfirm()">キャンセル</UButton>
              <UButton color="error" :loading="revokeSessionsLoading" @click="revokeAllSessionsForTargetUser">
                削除する
              </UButton>
            </template>
          </UModal>
        </template>
      </UModal>

      <UModal v-model:open="banModalOpen" title="BAN理由" description="空欄の場合は「管理者によるBAN」になります。"
        :ui="{ footer: 'justify-end' }">
        <template #body>
          <UFormField label="理由">
            <UTextarea v-model="banReasonDraft" :rows="4" class="w-full" placeholder="管理者によるBAN" />
          </UFormField>
        </template>

        <template #footer="{ close }">
          <UButton variant="ghost" :disabled="loading" @click="close()">キャンセル</UButton>
          <UButton color="warning" :loading="loading" @click="submitBan">BANする</UButton>
        </template>
      </UModal>
    </AppBackgroundCard>
  </div>
</template>
