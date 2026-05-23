<script setup lang="ts">
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui';
import { AuditListQuerySchema, type AuditListQuery } from '~~/shared/types/audit-list';

definePageMeta({
  layout: 'the-app',
  middleware: ['only-audit-log'],
});

const toast = useToast();

const { data: ownerOrganizations } = await useFetch('/api/pitamai/owner-list', {
  key: '/api/pitamai/owner-list',
});

type Schema = AuditListQuery;

const state = reactive<Schema>({
  organizationId: undefined,
  limit: 30,
  offset: 0,
  search: undefined,
});

const loading = ref(false);
const logs = ref<any[]>([]);
const total = ref<number | undefined>(undefined);
const tableFilter = ref('');
const globalSearchInput = ref('');

const dateFilter = reactive<{ start?: Date; end?: Date }>({});
const calendarRange = shallowRef<any>({ start: undefined, end: undefined });

function resetFilters() {
  tableFilter.value = '';
  dateFilter.start = undefined;
  dateFilter.end = undefined;
  calendarRange.value = { start: undefined, end: undefined };
  state.offset = 0;
  fetchLogs();
}

watch(
  calendarRange,
  value => {
    // CalendarDate.toDate('Asia/Tokyo') で JST の日付境界を正しく UTC に変換する
    // 例: CalendarDate(2026,5,23).toDate('Asia/Tokyo') → 2026-05-22T15:00:00.000Z (= JST 5/23 00:00)
    const toJstStartOfDay = (v: any): Date | undefined => {
      if (!v) return undefined;
      if (typeof v.toDate === 'function') {
        return v.toDate('Asia/Tokyo'); // JST 0:00:00 をUTCで返す
      }
      const d = new Date(v);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) - 9 * 3600 * 1000);
    };

    const toJstEndOfDay = (v: any): Date | undefined => {
      if (!v) return undefined;
      if (typeof v.toDate === 'function') {
        // toDate('Asia/Tokyo') は JST 0:00 → UTC 前日15:00。そこに 23h 59m 59s 999ms を足す
        const startOfDay = v.toDate('Asia/Tokyo') as Date;
        return new Date(startOfDay.getTime() + (23 * 3600 + 59 * 60 + 59) * 1000 + 999);
      }
      const d = new Date(v);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) - 9 * 3600 * 1000);
    };

    dateFilter.start = toJstStartOfDay(value?.start);
    // end 未選択（単独日付選択）の場合は start の終わりを使う
    dateFilter.end = toJstEndOfDay(value?.end ?? value?.start);

    state.offset = 0;
    fetchLogs();
  },
  { deep: true }
);

const currentPage = computed({
  get: () => Math.floor(state.offset / state.limit) + 1,
  set: (val) => {
    state.offset = (val - 1) * state.limit;
  },
});

const organizationItems = computed(() => {
  const items =
    ownerOrganizations.value?.map(org => ({
      label: `${org.name} (${org.slug})`,
      value: org.id,
    })) ?? [];

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

    const data = await $fetch('/api/pitamai/audit-list', { query });

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

async function onSubmit(event?: FormSubmitEvent<Schema>) {
  event?.preventDefault?.();
  if (loading.value) return;
  state.offset = 0;
  state.search = globalSearchInput.value || undefined;
  tableFilter.value = '';
  await fetchLogs();
}

watch(() => state.offset, () => {
  fetchLogs();
});

watch(() => state.organizationId, () => {
  state.offset = 0;
  fetchLogs();
});

onMounted(() => {
  fetchLogs();
});

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
      return JSON.stringify(details);
    },
  },
];
</script>

<template>
  <div>
    <AppBackgroundCard class="mx-auto w-full space-y-6">
      <div>
        <h2 class="text-lg font-bold text-gray-900">監査ログ (Owner Only)</h2>
        <p class="text-sm text-gray-500">組織内の操作履歴を確認できます。</p>
      </div>

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
          <UButton type="submit" :loading="loading">検索</UButton>
          <UButton variant="outline"
            :disabled="!globalSearchInput && !state.organizationId && !dateFilter.start && !dateFilter.end"
            @click="resetFilters">
            検索条件をクリア
          </UButton>
        </div>
      </UForm>

      <USeparator />

      <div v-if="logs.length" class="mt-4 mb-2 flex items-center gap-2 justify-between">
        <UInput v-model="tableFilter" placeholder="今表示されているテーブル内を検索..." class="flex-1 max-w-md" />
      </div>

      <AppDateRangePicker v-model="calendarRange" :clear-disabled="!tableFilter && !dateFilter.start && !dateFilter.end"
        @clear="resetFilters" />

      <div class="overflow-hidden">
        <UTable :key="logs.length" v-model:global-filter="tableFilter" :data="logs" :columns="columns"
          :loading="loading" class="w-full" />
      </div>

      <AppPaginationBar v-model:page="currentPage" :total="total ?? 0" :items-per-page="state.limit" />
    </AppBackgroundCard>
  </div>
</template>
