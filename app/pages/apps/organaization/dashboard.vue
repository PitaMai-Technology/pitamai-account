<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import * as z from 'zod';
import { authClient } from '~/composable/auth-client';

const toast = useToast();
const activeOrganization = authClient.useActiveOrganization();

const schema = z.object({
  organizationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  filterField: z.string().optional(),
  // サーバーと合わせて 'in' / 'nin' を許可
  filterOperator: z
    .enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'])
    .optional(),
  filterValue: z.string().optional(),
});

type Schema = z.output<typeof schema>;

// organizationId は一旦 undefined で初期化。activeOrganization が利用可能になったら補完する。
const state = reactive<Partial<Schema>>({
  organizationId: undefined,
  limit: 20, // デフォルト 20
  offset: 0,
  sortBy: undefined,
  sortDirection: 'asc',
  filterField: undefined,
  filterOperator: undefined,
  filterValue: undefined,
});

// activeOrganization がロードされたら state.organizationId が未設定なら補完する
watchEffect(() => {
  if (
    (state.organizationId === undefined || state.organizationId === null) &&
    activeOrganization.value?.data
  ) {
    state.organizationId = activeOrganization.value.data.name;
  }
});

const loading = ref(false);
const members = ref<any[]>([]);
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

const sortDirectionOptions = [
  { label: '昇順', value: 'asc' },
  { label: '降順', value: 'desc' },
];

// 例: フィールドは必要に応じて調整
const fieldOptions = [
  { label: 'メール', value: 'email' },
  { label: '名前', value: 'name' },
  { label: 'ロール', value: 'role' },
  { label: '作成日', value: 'createdAt' },
];

const canSearch = computed(() => !loading.value);

async function fetchMembers(query: Partial<Schema>) {
  loading.value = true;
  try {
    // filterOperator が in/nin の場合、フロントではカンマ区切りの文字列をそのまま渡す（サーバで配列化）
    const { data, error } = await authClient.organization.listMembers({
      query: {
        organizationId: activeOrganization.value.data?.name,
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        filterField: query.filterField,
        filterOperator: query.filterOperator,
        filterValue: query.filterValue,
      },
    });

    if (error) {
      toast.add({
        title: 'エラー',
        description: `ユーザー一覧の取得に失敗しました: ${error.message}`,
        color: 'error',
      });
      members.value = [];
      total.value = undefined;
      return;
    }

    // API の返却形式に合わせて調整
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
  } catch (e: unknown) {
    if (e instanceof Error) {
      toast.add({
        title: 'エラー',
        description: `ユーザー一覧取得中にエラーが発生しました: ${e.message}`,
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

async function onSubmit(event: FormSubmitEvent<Schema>) {
  async function onSubmit() {
    if (loading.value) return;
    // Use the reactive `state` (bound via v-model) as the query payload.
    await fetchMembers(state as Schema);
  }
  function resetForm() {
    state.organizationId = undefined;
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
}
</script>

<template>
  <div class="space-y-6 p-4">
    <h1 class="text-2xl font-semibold">オーガナイゼーション・メンバー検索</h1>

    <form
      @submit.prevent="onSubmit($event)"
      class="grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      <div>
        <label class="block text-sm">Organization ID</label>
        <input
          v-model="state.organizationId"
          type="text"
          class="w-full mt-1 input"
          placeholder="organization id"
        />
      </div>

      <div>
        <label class="block text-sm">Limit</label>
        <input
          v-model.number="state.limit"
          type="number"
          min="1"
          max="100"
          class="w-full mt-1 input"
        />
      </div>

      <div>
        <label class="block text-sm">Offset</label>
        <input
          v-model.number="state.offset"
          type="number"
          min="0"
          class="w-full mt-1 input"
        />
      </div>

      <div>
        <label class="block text-sm">Sort By</label>
        <select v-model="state.sortBy" class="w-full mt-1 input">
          <option value="">選択してください</option>
          <option v-for="f in fieldOptions" :key="f.value" :value="f.value">{{
            f.label
          }}</option>
        </select>
      </div>

      <div>
        <label class="block text-sm">Sort Direction</label>
        <select v-model="state.sortDirection" class="w-full mt-1 input">
          <option
            v-for="d in sortDirectionOptions"
            :key="d.value"
            :value="d.value"
            >{{ d.label }}</option
          >
        </select>
      </div>

      <div>
        <label class="block text-sm">Filter Field</label>
        <select v-model="state.filterField" class="w-full mt-1 input">
          <option value="">選択してください</option>
          <option v-for="f in fieldOptions" :key="f.value" :value="f.value">{{
            f.label
          }}</option>
        </select>
      </div>

      <div>
        <label class="block text-sm">Filter Operator</label>
        <select v-model="state.filterOperator" class="w-full mt-1 input">
          <option value="">選択してください</option>
          <option
            v-for="op in operatorOptions"
            :key="op.value"
            :value="op.value"
            >{{ op.label }}</option
          >
        </select>
      </div>

      <div>
        <label class="block text-sm">Filter Value</label>
        <input
          v-model="state.filterValue"
          type="text"
          class="w-full mt-1 input"
          placeholder="値（複数はカンマ区切り）"
        />
      </div>

      <div class="flex items-end gap-2 md:col-span-3">
        <button type="submit" class="btn btn-primary" :disabled="!canSearch">
          {{ loading ? '検索中...' : '検索' }}
        </button>
        <button type="button" class="btn" @click="resetForm" :disabled="loading"
          >リセット</button
        >
      </div>
    </form>

    <div v-if="total !== undefined" class="mt-4">
      <p>結果: {{ total }} 件</p>
    </div>

    <div v-if="members.length" class="overflow-auto mt-2">
      <table class="min-w-full divide-y">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left">ID</th>
            <th class="px-4 py-2 text-left">メール</th>
            <th class="px-4 py-2 text-left">名前</th>
            <th class="px-4 py-2 text-left">ロール</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          <tr v-for="m in members" :key="m.id">
            <td class="px-4 py-2">{{ m.id }}</td>
            <td class="px-4 py-2">{{ m.email }}</td>
            <td class="px-4 py-2">{{ m.name }}</td>
            <td class="px-4 py-2">{{ m.role }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.input {
  border: 1px solid #d1d5db;
  padding: 0.5rem;
  border-radius: 0.375rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  border: 1px solid #cbd5e1;
  background: #fff;
}

.btn-primary {
  background: #0ea5e9;
  color: white;
  border: none;
}
</style>
