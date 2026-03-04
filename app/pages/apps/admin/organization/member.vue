<script setup lang="ts">
import { h, resolveComponent } from 'vue';
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';
import { useConfirmDialogStore } from '~/stores/confirmDialog';
import type { z } from 'zod';

// @tanstack/vue-table の型がプロジェクトにインストールされていない環境向けに
// 必要最低限の型エイリアスをローカル定義します。
// ColumnFiltersState は TanStack の型では配列で、{ id, value } の形を取ることが多いです。
// 今回はカラムフィルタを廃止するため、この型は使いません。

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const confirmStore = useConfirmDialogStore();
const { confirm: confirmDialog } = confirmStore;
const activeOrganization = useActiveOrg();
// 管理者以上 (admin, owner) のみをサーバー側でフィルタした組織一覧を取得
const { data: adminOrganizations, status: adminOrganizationsStatus } = await useFetch(
  '/api/pitamai/admin-list',
  {
    key: '/api/pitamai/admin-list',
  }
);
const activeMember = authClient.useActiveMember();

// shared/types/member.ts から自動インポートされる
type Schema = z.infer<typeof ListMembersForm>;

const state = reactive<Partial<Schema>>({
  organizationId: undefined,
  limit: 20,
  offset: 0,
});

// activeOrganization がロードされたら state.organizationId を補完する
watchEffect(() => {
  if (
    (state.organizationId === undefined || state.organizationId === null) &&
    activeOrganization.value?.data
  ) {
    state.organizationId = activeOrganization.value.data.id;
  }
});

const loading = ref(false);
interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string | Date;
  user?: {
    email?: string | null;
    name?: string | null;
  } | null;
}

const members = ref<Member[]>([]);
const total = ref<number | undefined>(undefined);
const tableFilter = ref('');

const canSearch = computed(() => !loading.value && state.organizationId);

// 選択された組織の表示名を取得
const selectedOrganizationName = computed(() => {
  if (!state.organizationId || !adminOrganizations.value) return '';
  const org = adminOrganizations.value.find(item => item.id === state.organizationId);
  return org ? `${org.name} (${org.slug})` : '';
});

// map adminOrganizations into select items to avoid complex inline expressions in templates
const organizationItems = computed(() =>
  adminOrganizations.value?.map((org) => ({ label: `${org.name} (${org.slug})`, value: org.id })) ?? []
);

// UTable ui config as a separate const to avoid inline object in template
const tableUi = { td: 'break-words' } as const;

async function fetchMembers() {
  loading.value = true;
  try {
    // 以前の結果を即座にクリアして古いデータが表示されるのを防止
    members.value = [];
    total.value = undefined;

    if (!state.organizationId) {
      toast.add({
        title: 'エラー',
        description: 'Organization が選択されていません。',
        color: 'error',
      });
      loading.value = false;
      return;
    }

    const query = {
      organizationId: state.organizationId,
      limit: Number(state.limit ?? 20),
      offset: Number(state.offset ?? 0),
    };

    const { data, error } = await authClient.organization.listMembers({
      query,
    });

    if (error) {
      console.error('Client: listMembers SDK error:', error);
      toast.add({
        title: 'エラー',
        description: `ユーザー一覧の取得に失敗しました: ${error.message}`,
        color: 'error',
      });
      members.value = [];
      total.value = undefined;
      return;
    }

    console.debug('Client: listMembers response data:', data);

    if (data?.members && Array.isArray(data.members)) {
      members.value = data.members;
      total.value =
        typeof data.total === 'number' ? data.total : data.members.length;
    } else if (Array.isArray(data)) {
      members.value = data;
      total.value = data.length;
    } else {
      members.value = [];
      total.value = undefined;
    }
  } catch (error: unknown) {
    console.error('Client: fetchMembers unexpected error:', error);
    if (error instanceof Error) {
      toast.add({
        title: 'エラー',
        description: error.message,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: 'ユーザー一覧取得中に予期しないエラーが発生しました',
        color: 'error',
      });
    }
    members.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function onSubmit(event?: FormSubmitEvent<Schema>) {
  event?.preventDefault?.();
  if (loading.value) return;

  const parsed = ListMembersForm.safeParse(state);
  if (!parsed.success) {
    toast.add({
      title: '入力エラー',
      description: '入力値が不正です。',
      color: 'error',
    });
    return;
  }

  await fetchMembers();
}

function resetForm() {
  state.organizationId = activeOrganization.value?.data?.id;
  state.limit = 20;
  state.offset = 0;
  members.value = [];
  total.value = undefined;
  // フォームリセット時はテーブルフィルターもクリア
  tableFilter.value = '';
}

// テーブルのフィルター（グローバル + カラム）をクリアするヘルパー
// clearTableFilters は不要になったが残しておく（将来的な拡張用）
// clearTableFilters removed — keep a helper to reset global search if needed
function _clearTableFilters(): void {
  tableFilter.value = '';
}

const columns: TableColumn<Member>[] = [
  {
    accessorKey: 'id',
    header: 'メンバーID',
  },
  {
    accessorKey: 'userId',
    header: 'ユーザーID',
  },
  {
    // ヘッダースロットを安全にターゲットするための id
    id: 'email',
    accessorKey: 'user.email',
    header: 'メール',
    cell: ({ row }) => row.original.user?.email || 'N/A',
  },
  {
    id: 'name',
    accessorKey: 'user.name',
    header: '名前',
    cell: ({ row }) => row.original.user?.name || 'N/A',
  },
  {
    accessorKey: 'role',
    header: 'ロール',
  },
  {
    accessorKey: 'createdAt',
    header: '参加日',
    cell: ({ row }) =>
      new Date(row.getValue('createdAt')).toLocaleDateString('ja-JP'),
  },
  {
    accessorKey: 'actions',
    header: 'アクション',
    cell: ({ row }) => {
      const member = row.original as Member;
      const isSelf = activeMember.value?.data?.id === member.id;
      const USelect = resolveComponent('USelect');
      const UButton = resolveComponent('UButton');
      return h('div', { class: 'flex items-center gap-2' }, [
        h(USelect, {
          disabled: loading.value || isSelf,
          modelValue: member.role,
          'onUpdate:modelValue': (v: string) =>
            onChangeMemberRole(member, String(v)),
          items: [
            { label: 'member', value: 'member' },
            { label: 'admins', value: 'admins' },
            { label: 'owner', value: 'owner' },
          ],
          clearable: false,
          class: 'w-36',
        }),
        // 削除ボタンは常に表示するが、現在のアクティブメンバーの場合は無効化する
        h(
          UButton,
          {
            variant: 'ghost',
            class: isSelf ? 'text-gray-400' : 'text-red-500',
            onClick: () => {
              if (isSelf) return; // 誤操作防止のためのガード
              confirmRemoveMember(member);
            },
            disabled: loading.value || isSelf,
            title: isSelf ? '自分自身は削除できません' : '削除',
            'aria-disabled': String(loading.value || isSelf),
          },
          {
            default: () => '削除',
          }
        ),
      ]);
    },
  },
];

let pendingRemoveMember: Member | null = null;
type RemoveTarget = {
  organizationId: string;
  memberIdOrEmail: string;
};

async function confirmRemoveMember(member: Member) {
  if (!state.organizationId) {
    toast.add({
      title: 'エラー',
      description: 'Organization が選択されていません。',
      color: 'error',
    });
    return;
  }

  // await 前に対象を確定（非同期待機中の状態変化を防ぐ）
  const target: RemoveTarget = {
    organizationId: state.organizationId,
    memberIdOrEmail: member.user?.email || member.userId || member.id,
  };

  const confirmed = await confirmDialog(
    `${member.user?.email ?? member.userId} を組織から削除しますか？`
  );
  if (!confirmed) return;

  await onConfirmRemove(target);
}

async function onConfirmRemove(target: RemoveTarget) {
  try {
    loading.value = true;
    const res = await authClient.organization.removeMember({
      memberIdOrEmail: target.memberIdOrEmail,
      organizationId: target.organizationId,
    });

    if (res.error) {
      console.error('Client: removeMember SDK error:', res.error);
      toast.add({
        title: 'エラー',
        description: `メンバー削除に失敗しました: ${res.error.message}`,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '成功',
      description: 'メンバーを削除しました',
      color: 'success',
    });
    // 再取得
    await fetchMembers();
  } catch (e: unknown) {
    console.error('Client: onConfirmRemove unexpected error:', e);
    toast.add({
      title: 'エラー',
      description: 'メンバー削除中にエラーが発生しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function onChangeMemberRole(member: Member, newRole: string) {
  if (!state.organizationId) {
    toast.add({
      title: 'エラー',
      description: 'Organization が選択されていません。',
      color: 'error',
    });
    return;
  }
  if (member.role === newRole) return;

  try {
    loading.value = true;
    const res = await authClient.organization.updateMemberRole({
      memberId: member.id,
      role: newRole,
      organizationId: state.organizationId,
    });

    if (res.error) {
      console.error('Client: updateMemberRole SDK error:', res.error);
      toast.add({
        title: 'エラー',
        description: `ロール更新に失敗しました: ${res.error.message}`,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '成功',
      description: 'メンバーのロールを更新しました',
      color: 'success',
    });
    await fetchMembers();
  } catch (e: unknown) {
    console.error('Client: onChangeMemberRole unexpected error:', e);
    toast.add({
      title: 'エラー',
      description: 'ロール更新中にエラーが発生しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <AppBackgroundCard class="mx-auto w-full space-y-6">
      <div>
        <h1 class="text-2xl font-semibold">オーガナイゼーション メンバー検索</h1>
        <p class="mt-2 text-sm text-gray-600">メンバーを検索します。</p>
      </div>

      <UForm :schema="ListMembersForm" :state="state" class="grid grid-cols-1 md:grid-cols-2 gap-4"
        @submit.prevent="onSubmit">
        <UFormField label="Organization" name="organizationId">
          <div>
            <div v-if="adminOrganizationsStatus === 'pending'" class="flex items-center gap-2">
              <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin text-primary" />
              <span class="text-sm text-gray-500">読み込み中...</span>
            </div>
            <div v-else-if="!adminOrganizations || adminOrganizations.length === 0" class="text-sm text-gray-500">
              所属している組織がありません
            </div>
            <div v-else>
              <USelect v-model="state.organizationId" :items="organizationItems" placeholder="-- 組織を選択 --" clearable
                class="w-full" />
              <span v-if="selectedOrganizationName" class="text-xs text-gray-500">
                選択中: {{ selectedOrganizationName }}
              </span>
            </div>
          </div>
        </UFormField>

        <UFormField label="Limit" name="limit">
          <UInput v-model.number="state.limit" type="number" min="1" max="100" />
        </UFormField>

        <UFormField label="Offset" name="offset">
          <UInput v-model.number="state.offset" type="number" min="0" />
        </UFormField>

        <!-- other filters and sorting removed to keep UI simple (limit/offset only) -->

        <div class="md:col-span-2 flex gap-2 justify-end">
          <UButton type="submit" color="primary" :loading="loading" :disabled="!canSearch">
            {{ loading ? '検索中...' : '検索' }}
          </UButton>
          <UButton variant="ghost" :disabled="loading" @click="resetForm">リセット</UButton>
        </div>
      </UForm>

      <div v-if="total !== undefined" class="mt-4">
        <p>結果: {{ total }} 件</p>
      </div>

      <div v-if="members.length" class="mt-4 mb-2 flex items-center gap-2 justify-between">
        <UInput v-model="tableFilter" placeholder="テーブル全体を検索..." class="flex-1 max-w-md" />
        <UButton variant="ghost" :disabled="!tableFilter" label="検索クリア" @click="_clearTableFilters" />
      </div>

      <!-- グローバルテーブル検索は廃止 -->

      <div v-if="members.length" class="overflow-auto mt-2">
        <UTable :key="state.organizationId" ref="membersTable" v-model:global-filter="tableFilter" :data="members"
          :columns="columns" :loading="loading" empty="メンバーが見つかりません。" class="table-fixed" :ui="tableUi">
          <!-- column filters have been removed for simplicity -->
        </UTable>
      </div>

      <div v-else-if="!loading" class="text-sm text-gray-600">メンバーが見つかりません。</div>
    </AppBackgroundCard>

    <!-- 削除確認モーダル（store駆動） -->
    <TheConfirmModal />
  </div>
</template>
