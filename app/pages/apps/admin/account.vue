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
    header: 'BAN理由',
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
let pendingRemoveUser: AdminUser | null = null;

function confirmDeleteUser(user: AdminUser) {
  pendingRemoveUser = user;
  confirmMessage.value = `${user.email ?? user.id} を完全に削除します。よろしいですか？`;
  confirmOpen.value = true;
}

async function onConfirmRemove() {
  if (!pendingRemoveUser) return;
  try {
    loading.value = true;
    const { error } = await authClient.admin.removeUser({
      userId: pendingRemoveUser.id,
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

    await fetchUsers();
  } catch (e: unknown) {
    console.error('admin account delete error:', e);
    toast.add({
      title: 'エラー',
      description: 'ユーザーの削除に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
    confirmOpen.value = false;
    pendingRemoveUser = null;
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
      <TheConfirmModal v-model:open="confirmOpen" :message="confirmMessage" @confirm="onConfirmRemove" />
    </AppBackgroundCard>
  </div>
</template>
