<script setup lang="ts">
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui';
import { useActiveOrg } from '~/composable/useActiveOrg';
import { AuditListQuerySchema, type AuditListQuery } from '~~/shared/types/audit-list';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const activeOrganization = useActiveOrg();

// オーナー権限を持つ組織一覧を取得
const { data: ownerOrganizations } = await useFetch('/api/pitamai/owner-list', {
  key: '/api/pitamai/owner-list',
});

// フォームスキーマ
// クライアント側フォーム用に少し調整（z.coerceなどは不要な場合もあるが、共有スキーマを使うのが基本）
// ただしフォーム入力値として使うため、型定義を利用
type Schema = AuditListQuery;

const state = reactive<Schema>({
  organizationId: undefined,
  limit: 20,
  offset: 0,
});

// 初期化時に現在の組織をセット

const loading = ref(false);
const logs = ref<any[]>([]);
const total = ref<number | undefined>(undefined);
const tableFilter = ref('');

// ページネーション用の計算プロパティ
const currentPage = computed({
  get: () => Math.floor(state.offset / state.limit) + 1,
  set: (val) => {
    state.offset = (val - 1) * state.limit;
  },
});

// 組織選択肢
const organizationItems = computed(() => {
  const items =
    ownerOrganizations.value?.map(org => ({
      label: `${org.name} (${org.slug})`,
      value: org.id,
    })) ?? [];

  // 先頭に「すべてのログ」を追加
  return [{ label: 'すべてのログ', value: undefined }, ...items];
});

async function fetchLogs() {
  loading.value = true;
  try {
    logs.value = [];
    total.value = undefined;

    const query = {
      limit: state.limit,
      offset: state.offset,
      organizationId: state.organizationId,
    };

    const data = await $fetch('/api/pitamai/audit-list', {
      query,
    });

    if (data) {
      logs.value = data.logs;
      total.value = data.total;
    }
  } catch (e: any) {
    console.error('Audit log fetch error:', e);
    toast.add({
      title: 'エラー',
      description: e.statusMessage || '監査ログの取得に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

// 検索実行
async function onSubmit(event?: FormSubmitEvent<Schema>) {
  event?.preventDefault?.();
  if (loading.value) return;
  state.offset = 0; // 検索時は1ページ目に戻す
  tableFilter.value = ''; // 検索時はテーブルフィルタもクリア
  await fetchLogs();
}

// ページネーション変更時
watch(
  () => state.offset,
  () => {
    fetchLogs();
  }
);

// 組織変更時に再取得
watch(
  () => state.organizationId,
  () => {
    state.offset = 0;
    fetchLogs();
  }
);

// 初回ロード
onMounted(() => {
  // 組織IDがなくても全件取得を実行
  fetchLogs();
});

// カラム定義
const columns: TableColumn<any>[] = [
  {
    accessorKey: 'createdAt',
    header: '日時',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
  },
  {
    accessorKey: 'action',
    header: 'アクション',
  },
  {
    header: '実行ユーザー',
    cell: ({ row }) => {
      const user = row.original.user;
      return user ? `${user.email || 'No Email'} (${user.name || 'No Name'})` : 'System / Unknown';
    },
  },
  {
    accessorKey: 'targetId',
    header: '対象ID',
  },
  {
    header: '詳細',
    cell: ({ row }) => {
      const details = row.original.details;
      if (!details) return '-';
      return JSON.stringify(details); // 簡易表示
    },
  },
];
</script>

<template>
  <div>
    <AppBackgroundCard class="mx-auto w-full space-y-6">
      <div>
        <h2 class="text-lg font-bold text-gray-900">監査ログ (Owner Only)</h2>
        <p class="text-sm text-gray-500">
          組織内の操作履歴を確認できます。
        </p>
      </div>

      <!-- 検索フォーム -->
      <UForm :schema="AuditListQuerySchema" :state="state" class="space-y-4 mb-8" @submit="onSubmit">
        <div class="flex flex-wrap gap-4 items-end">
          <UFormField label="組織" name="organizationId" class="min-w-[200px]">
            <USelect v-model="state.organizationId" :items="organizationItems"
              :placeholder="state.organizationId === undefined ? 'すべてのログ' : '組織を選択'" class="w-full" />
          </UFormField>
        </div>
        <UButton type="submit" :loading="loading">
          更新
        </UButton>
      </UForm>

      <!-- テーブル -->
      <div v-if="logs.length" class="mt-4 mb-2 flex items-center gap-2 justify-between">
        <UInput v-model="tableFilter" placeholder="テーブル全体を検索..." class="flex-1 max-w-md" />
        <UButton variant="ghost" :disabled="!tableFilter" label="検索クリア" @click.prevent="tableFilter = ''" />
      </div>

      <div class="overflow-hidden">
        <UTable :key="logs.length" v-model:global-filter="tableFilter" :data="logs" :columns="columns"
          :loading="loading" class="w-full" />
      </div>

      <!-- ページネーション -->
      <div v-if="total !== undefined && total > 0" class="flex justify-center pt-4">
        <UPagination v-model:page="currentPage" :total="total" :items-per-page="state.limit" @update:page="(page) => {
          state.offset = (page - 1) * state.limit;
        }" />
      </div>
    </AppBackgroundCard>
  </div>
</template>
