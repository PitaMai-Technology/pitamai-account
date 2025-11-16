<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import type { z } from 'zod';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const activeOrganization = authClient.useActiveOrganization();
const organizations = authClient.useListOrganizations();

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
};

const members = ref<Member[]>([]);
const total = ref<number | undefined>(undefined);

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
  if (!state.organizationId || !organizations.value.data) return '';
  const org = organizations.value.data.find(
    item => item.id === state.organizationId
  );
  return org ? `${org.name} (${org.slug})` : '';
});

async function fetchMembers() {
  loading.value = true;
  try {
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

    toast.add({
      title: '成功',
      description: 'ユーザー一覧を取得しました。',
      color: 'success',
    });
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
}
</script>

<template>
  <div class="p-4 space-y-6">
    <h1 class="text-2xl font-semibold">オーガナイゼーション メンバー検索</h1>

    <form class="grid grid-cols-1 md:grid-cols-3 gap-4" @submit.prevent="onSubmit()">
      <div>
        <label class="block text-sm mb-1">Organization</label>
        <div v-if="organizations.isPending" class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin text-primary" />
          <span class="text-sm text-gray-500">読み込み中...</span>
        </div>
        <div v-else-if="!organizations.data || organizations.data.length === 0" class="text-sm text-gray-500">
          所属している組織がありません
        </div>
        <select v-else v-model="state.organizationId" class="w-full input">
          <option value="">-- 組織を選択 --</option>
          <option v-for="org in organizations.data" :key="org.id" :value="org.id">
            {{ org.name }} ({{ org.slug }})
          </option>
        </select>
        <span v-if="selectedOrganizationName" class="text-xs text-gray-500">
          選択中: {{ selectedOrganizationName }}
        </span>
      </div>

      <div>
        <label class="block text-sm mb-1">Limit</label>
        <input v-model.number="state.limit" type="number" min="1" max="100" class="w-full input">
      </div>

      <div>
        <label class="block text-sm mb-1">Offset</label>
        <input v-model.number="state.offset" type="number" min="0" class="w-full input">
      </div>

      <div>
        <label class="block text-sm mb-1">Sort By</label>
        <select v-model="state.sortBy" class="w-full input">
          <option value="">-- 選択 --</option>
          <option v-for="field in fieldOptions" :key="field.value" :value="field.value">{{ field.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">Sort Direction</label>
        <select v-model="state.sortDirection" class="w-full input">
          <option value="asc">昇順</option>
          <option value="desc">降順</option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">Filter Field</label>
        <select v-model="state.filterField" class="w-full input">
          <option value="">-- 選択 --</option>
          <option v-for="field in fieldOptions" :key="field.value" :value="field.value">{{ field.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">Filter Operator</label>
        <select v-model="state.filterOperator" class="w-full input">
          <option value="">-- 選択 --</option>
          <option v-for="operator in operatorOptions" :key="operator.value" :value="operator.value">{{ operator.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">Filter Value</label>
        <input v-model="state.filterValue" type="text" class="w-full input" placeholder="値（複数はカンマ区切り）">
      </div>

      <div class="md:col-span-3 flex gap-2 justify-end items-end">
        <button type="submit" class="btn btn-primary" :disabled="!canSearch">
          {{ loading ? '検索中...' : '検索' }}
        </button>
        <button type="button" class="btn" :disabled="loading" @click="resetForm">リセット</button>
      </div>
    </form>

    <div v-if="total !== undefined" class="mt-4">
      <p>結果: {{ total }} 件</p>
    </div>

    <div v-if="members.length" class="overflow-auto mt-2">
      <table class="min-w-full">
        <thead>
          <tr>
            <th class="px-3 py-2 text-left">メンバーID</th>
            <th class="px-3 py-2 text-left">ユーザーID</th>
            <th class="px-3 py-2 text-left">メール</th>
            <th class="px-3 py-2 text-left">名前</th>
            <th class="px-3 py-2 text-left">ロール</th>
            <th class="px-3 py-2 text-left">参加日</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in members" :key="member.id">
            <td class="px-3 py-2">{{ member.id }}</td>
            <td class="px-3 py-2">{{ member.userId }}</td>
            <td class="px-3 py-2">{{ member.user?.email || 'N/A' }}</td>
            <td class="px-3 py-2">{{ member.user?.name || 'N/A' }}</td>
            <td class="px-3 py-2">{{ member.role }}</td>
            <td class="px-3 py-2">{{
              new Date(member.createdAt).toLocaleDateString('ja-JP')
              }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!loading" class="text-sm text-gray-600">メンバーが見つかりません。</div>

    <hr class="mt-6">



  </div>
</template>
