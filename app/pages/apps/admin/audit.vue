<script setup lang="ts">
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui';
import { AuditListQuerySchema, type AuditListQuery } from '~~/shared/types/audit-list';

definePageMeta({
  layout: 'the-app',
  middleware: ['only-audit-log'],
});

const toast = useToast();

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
  limit: 30,
  offset: 0,
  search: undefined,
});

// 初期化時に現在の組織をセット

const loading = ref(false);
const logs = ref<any[]>([]);
const total = ref<number | undefined>(undefined);
const tableFilter = ref('');
const globalSearchInput = ref('');

// 日付レンジフィルタ用（start/end を Date で保持）
const dateFilter = reactive<{ start?: Date; end?: Date }>({});

// UCalendar 用のモデル（CalendarDate 相当の構造を受け取り、Date に変換して保持）
const calendarRange = shallowRef<any>({ start: undefined, end: undefined });

watch(
  calendarRange,
  value => {
    if (value?.start) {
      dateFilter.start = value.start.toDate?.('UTC') ?? new Date(value.start);
    } else {
      dateFilter.start = undefined;
    }

    if (value?.end) {
      dateFilter.end = value.end.toDate?.('UTC') ?? new Date(value.end);
    } else {
      dateFilter.end = undefined;
    }

    // 日付レンジが変わったら 1 ページ目に戻して再取得
    state.offset = 0;
    fetchLogs();
  },
  { deep: true }
);

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
      search: state.search || undefined,
      startAt: dateFilter.start ? dateFilter.start.toISOString() : undefined,
      endAt: dateFilter.end ? dateFilter.end.toISOString() : undefined,
    };

    const data = await $fetch('/api/pitamai/audit-list', {
      query,
    });

    if (data) {
      logs.value = data.logs as any[];
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
  state.search = globalSearchInput.value || undefined;
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
      <UForm :schema="AuditListQuerySchema" :state="state" class="space-y-4 mb-8 mt-10" @submit="onSubmit">
        <div class="flex flex-wrap gap-4 items-end">
          <UFormField label="組織" name="organizationId" class="min-w-50">
            <USelect v-model="state.organizationId" :items="organizationItems"
              :placeholder="state.organizationId === undefined ? 'すべてのログ' : '組織を選択'" class="w-full" />
          </UFormField>
          <UFormField label="全体検索" name="search" class="flex-1 min-w-75">
            <UInput v-model="globalSearchInput" placeholder="アクション、対象ID、ユーザー名、メールアドレスで検索..." class="w-full"
              @keydown.enter.prevent="onSubmit()" />
          </UFormField>
        </div>
        <div class="flex gap-2">
          <UButton type="submit" :loading="loading">
            検索
          </UButton>
          <UButton variant="outline" :disabled="!globalSearchInput && !state.organizationId" @click="() => {
            globalSearchInput = '';
            state.search = undefined;
            state.organizationId = undefined;
            state.offset = 0;
            fetchLogs();
          }">
            検索条件をクリア
          </UButton>
        </div>
      </UForm>

      <USeparator />

      <div v-if="logs.length" class="mt-4 mb-2 flex items-center gap-2 justify-between">

        <UInput v-model="tableFilter" placeholder="今表示されているテーブル内を検索..." class="flex-1 max-w-md" />
        <UButton variant="ghost" :disabled="!tableFilter && !dateFilter.start && !dateFilter.end" label="絞り込みクリア"
          @click.prevent="() => {
            tableFilter = '';
            dateFilter.start = undefined;
            dateFilter.end = undefined;
            calendarRange.value = { start: undefined, end: undefined };
            state.offset = 0;
            fetchLogs();
          }" />
      </div>
      <!-- 日付検索 -->
      <UFormField label="日付範囲" name="dateRange" class="min-w-65 mt-6">
        <UPopover>
          <UButton color="neutral" variant="subtle" icon="i-lucide-calendar">
            <template v-if="dateFilter.start">
              <template v-if="dateFilter.end">
                {{ dateFilter.start.toLocaleDateString('ja-JP') }} -
                {{ dateFilter.end.toLocaleDateString('ja-JP') }}
              </template>
              <template v-else>
                {{ dateFilter.start.toLocaleDateString('ja-JP') }}
              </template>
            </template>
            <template v-else>
              日付で絞り込み
            </template>
          </UButton>

          <template #content>
            <UCalendar v-model="calendarRange" range class="p-2" :number-of-months="2">
              <!-- ここではデフォルトの day 表示を使用 -->
            </UCalendar>
          </template>
        </UPopover>
      </UFormField>
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
