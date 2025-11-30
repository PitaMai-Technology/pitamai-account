<script setup lang="ts">
import { h, resolveComponent } from 'vue';
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import type { z } from 'zod';

// @tanstack/vue-table の型がプロジェクトにインストールされていない環境向けに
// 必要最低限の型エイリアスをローカル定義します。
// ColumnFiltersState は TanStack の型では配列で、{ id, value } の形を取ることが多いです。
// ここでは value を必須にして UTable の期待型に合わせます。
type ColumnFiltersState = Array<{ id: string; value: unknown }>;

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const activeOrganization = authClient.useActiveOrganization();
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
  sortBy: undefined,
  sortDirection: 'asc',
  filterField: undefined,
  filterOperator: undefined,
  filterValue: undefined,
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
// カラムごとのクライアント側フィルタリング用（TanStack ColumnFiltersState）
const columnFilters = ref<ColumnFiltersState>([]);

const operatorOptions = [
  { label: '等しい (eq)', value: 'eq' },
  { label: '等しくない (ne)', value: 'ne' },
  { label: 'より大きい (gt)', value: 'gt' },
  { label: '以上 (gte)', value: 'gte' },
  { label: 'より小さい (lt)', value: 'lt' },
  { label: '以下 (lte)', value: 'lte' },
  { label: '含む (contains)', value: 'contains' },
];

const fieldOptions = [
  { label: 'メール', value: 'email' },
  { label: '名前', value: 'name' },
  { label: 'ロール', value: 'role' },
  { label: '作成日', value: 'createdAt' },
];

const canSearch = computed(() => !loading.value && state.organizationId);

// 選択された組織の表示名を取得
const selectedOrganizationName = computed(() => {
  if (!state.organizationId || !adminOrganizations.value) return '';
  const org = adminOrganizations.value.find(item => item.id === state.organizationId);
  return org ? `${org.name} (${org.slug})` : '';
});

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
      sortBy: state.sortBy,
      sortDirection: state.sortDirection,
      filterField: state.filterField,
      filterOperator: state.filterOperator,
      filterValue: state.filterValue,
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
  state.sortBy = undefined;
  state.sortDirection = 'asc';
  state.filterField = undefined;
  state.filterOperator = undefined;
  state.filterValue = undefined;
  members.value = [];
  total.value = undefined;
  // フォームリセット時はテーブルフィルターもクリアする
  tableFilter.value = '';
  columnFilters.value = [];
}

// テーブルのフィルター（グローバル + カラム）をクリアするヘルパー
function clearTableFilters(): void {
  tableFilter.value = '';
  columnFilters.value = [];
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
          modelValue: member.role,
          'onUpdate:modelValue': (v: string) =>
            onChangeMemberRole(member, String(v)),
          items: [
            { label: 'member', value: 'member' },
            { label: 'admin', value: 'admin' },
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

// 削除確認モーダルの状態
const confirmOpen = ref(false);
const confirmMessage = ref('');
let pendingRemoveMember: Member | null = null;

function confirmRemoveMember(member: Member) {
  pendingRemoveMember = member;
  confirmMessage.value = `${member.user?.email ?? member.userId} を組織から削除しますか？`;
  confirmOpen.value = true;
}

async function onConfirmRemove() {
  if (!pendingRemoveMember) return;
  try {
    loading.value = true;
    const res = await authClient.organization.removeMember({
      // メールを優先し、次に userId、最後に member レコードの id を使用
      memberIdOrEmail:
        pendingRemoveMember.user?.email ||
        pendingRemoveMember.userId ||
        pendingRemoveMember.id,
      organizationId: state.organizationId,
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
    confirmOpen.value = false;
    pendingRemoveMember = null;
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

      <UForm :schema="ListMembersForm" :state="state" class="grid grid-cols-1 md:grid-cols-3 gap-4" @submit="onSubmit">
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
              <USelect v-model="state.organizationId" :items="adminOrganizations.map(org => ({
                label: `${org.name} (${org.slug})`,
                value: org.id,
              }))
                " placeholder="-- 組織を選択 --" clearable class="w-full" />
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

        <UFormField label="Sort By" name="sortBy">
          <USelect v-model="state.sortBy" :items="fieldOptions.map(f => ({ label: f.label, value: f.value }))"
            placeholder="-- 選択 --" clearable />
        </UFormField>

        <UFormField label="Sort Direction" name="sortDirection">
          <USelect v-model="state.sortDirection" :items="[
            { label: '昇順', value: 'asc' },
            { label: '降順', value: 'desc' },
          ]" />
        </UFormField>

        <UFormField label="Filter Field" name="filterField">
          <USelect v-model="state.filterField" :items="fieldOptions.map(f => ({ label: f.label, value: f.value }))"
            placeholder="-- 選択 --" clearable />
        </UFormField>

        <UFormField label="Filter Operator" name="filterOperator">
          <USelect v-model="state.filterOperator" :items="operatorOptions.map(o => ({ label: o.label, value: o.value }))
            " placeholder="-- 選択 --" clearable />
        </UFormField>

        <UFormField label="Filter Value" name="filterValue" class="md:col-span-3">
          <UInput v-model="state.filterValue" placeholder="値（複数はカンマ区切り）" />
        </UFormField>

        <div class="md:col-span-3 flex gap-2 justify-end">
          <UButton type="submit" color="primary" :loading="loading" :disabled="!canSearch">
            {{ loading ? '検索中...' : '検索' }}
          </UButton>
          <UButton variant="ghost" :disabled="loading" @click="resetForm">リセット</UButton>
        </div>
      </UForm>

      <div v-if="total !== undefined" class="mt-4">
        <p>結果: {{ total }} 件</p>
      </div>

      <!-- グローバルテーブル検索（UX向上のためテーブル上部に配置） -->
      <div v-if="members.length" class="mt-4 mb-2 flex items-center gap-2 justify-between">
        <UInput v-model="tableFilter" placeholder="テーブル全体を検索..." class="flex-1 max-w-md" />
        <UButton variant="ghost" :disabled="!tableFilter && columnFilters.length === 0" label="すべてのフィルターをクリア"
          @click="clearTableFilters" />
      </div>

      <div v-if="members.length" class="overflow-auto mt-2">
        <UTable :key="state.organizationId" ref="membersTable" v-model:global-filter="tableFilter"
          v-model:column-filters="columnFilters" :data="members" :columns="columns" :loading="loading"
          empty="メンバーが見つかりません。" class="table-fixed" :ui="{ td: 'break-words' }">
          <!-- カラムフィルタ用のヘッダースロット -->
          <template #email-header="{ column }">
            <UInput :model-value="(column.getFilterValue() as string) || ''" placeholder="メールでフィルタ"
              class="w-full max-w-xs" @update:model-value="
                val => column.setFilterValue(val || undefined)
              " />
          </template>
          <template #name-header="{ column }">
            <UInput :model-value="(column.getFilterValue() as string) || ''" placeholder="名前でフィルタ"
              class="w-full max-w-xs" @update:model-value="
                val => column.setFilterValue(val || undefined)
              " />
          </template>
          <template #role-header="{ column }">
            <USelect :model-value="(column.getFilterValue() as string) || ''" :items="[
              { label: 'member', value: 'member' },
              { label: 'admin', value: 'admin' },
              { label: 'owner', value: 'owner' },
            ]" placeholder="ロールでフィルタ" clearable class="w-full max-w-xs" @update:model-value="
              val => column.setFilterValue(val || undefined)
            " />
          </template>
          <template #createdAt-header="{ column }">
            <UInput :model-value="(column.getFilterValue() as string) || ''" placeholder="参加日でフィルタ (YYYY-MM-DD)"
              class="w-full max-w-xs" @update:model-value="
                val => column.setFilterValue(val || undefined)
              " />
          </template>
        </UTable>
      </div>

      <div v-else-if="!loading" class="text-sm text-gray-600">メンバーが見つかりません。</div>
    </AppBackgroundCard>

    <!-- 削除確認モーダル -->
    <TheConfirmModal v-model:open="confirmOpen" :message="confirmMessage" @confirm="onConfirmRemove" />
  </div>
</template>
