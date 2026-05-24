<script setup lang="ts">
import { h, resolveComponent } from 'vue';
import type { TableColumn } from '@nuxt/ui';
import { useDateRangeFilter } from '~/composable/useDateRangeFilter';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({
  layout: 'the-app',
});

type RegisterStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

type RegistrationRequest = {
  id: string;
  email: string;
  name: string;
  age: number;
  discordId: string;
  agreedToTerms: boolean;
  status: RegisterStatus;
  reviewedAt?: string | Date | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  createdAt: string | Date;
  user?: {
    id: string;
  } | null;
};

const route = useRoute();
const toast = useToast();
const confirmStore = useConfirmDialogStore();
const { confirm: confirmDialog } = confirmStore;

const loading = ref(false);
const requests = ref<RegistrationRequest[]>([]);
const tableFilter = ref('');
const total = ref<number | undefined>(undefined);

const state = reactive({
  limit: 20,
  offset: 0,
});

const currentPage = computed({
  get: () => Math.floor(state.offset / state.limit) + 1,
  set: (val) => {
    state.offset = (val - 1) * state.limit;
  },
});

const dateFilter = reactive<{ start?: Date; end?: Date }>({});
const calendarRange = shallowRef<any>({ start: undefined, end: undefined });

function resetFilters() {
  tableFilter.value = '';
  dateFilter.start = undefined;
  dateFilter.end = undefined;
  calendarRange.value = { start: undefined, end: undefined };
  state.offset = 0;
  fetchRequests();
}

useDateRangeFilter({
  calendarRange,
  dateFilter,
  onRangeChanged: () => {
    state.offset = 0;
    fetchRequests();
  },
});

watch(
  () => state.offset,
  () => {
    fetchRequests();
  }
);

watch(
  () => state.limit,
  () => {
    state.offset = 0;
    fetchRequests();
  }
);

const rejectModalOpen = ref(false);
const rejectReasonDraft = ref('');
const pendingRejectRequest = ref<RegistrationRequest | null>(null);
const rejectionViewOpen = ref(false);
const rejectionViewText = ref('');

function openRejectionView(text: string | null | undefined) {
  rejectionViewText.value = text ?? '';
  rejectionViewOpen.value = true;
}

type ApiErrorLike = {
  data?: {
    message?: string;
  };
  message?: string;
};

const columns: TableColumn<RegistrationRequest>[] = [
  { accessorKey: 'id', header: '申請識別用ID' },
  { accessorKey: 'createdAt', header: '申請日時', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('ja-JP') },
  {
    accessorKey: 'email',
    header: 'メールアドレス',
    cell: ({ row }) => {
      const email = row.original.email;
      const user = row.original.user;
      const UBadge = resolveComponent('UBadge');
      const NuxtLink = resolveComponent('NuxtLink');

      return h('div', { class: 'flex flex-col gap-1' }, [
        h('span', email),
        user
          ? h(
            'div',
            { class: 'flex items-center gap-1' },
            h(
              NuxtLink,
              {
                to: `/apps/admin/account?id=${user.id}`,
                class: 'inline-flex',
              },
              h(
                UBadge,
                {
                  color: 'info',
                  variant: 'soft',
                  size: 'sm',
                  class: 'cursor-pointer hover:opacity-80',
                },
                { default: () => 'アカウント作成済み' }
              )
            )
          )
          : null,
      ]);
    },
  },
  { accessorKey: 'name', header: '名前' },
  { accessorKey: 'age', header: '年齢' },
  { accessorKey: 'discordId', header: 'Discord ID' },
  { accessorKey: 'agreedToTerms', header: '同意項目への同意', cell: ({ row }) => (row.original.agreedToTerms ? 'はい' : 'いいえ') },
  {
    accessorKey: 'status',
    header: '状態',
    cell: ({ row }) => {
      const status = row.original.status;
      let color = 'warning';
      let label = '審査中';
      if (status === 'approved') {
        color = 'success';
        label = '承認済み';
      } else if (status === 'rejected') {
        color = 'error';
        label = '却下済み';
      }
      const UBadge = resolveComponent('UBadge');
      return h(UBadge, { color, variant: 'soft' }, { default: () => label });
    },
  },
  { accessorKey: 'reviewedAt', header: '審査日時', cell: ({ row }) => (row.original.reviewedAt ? new Date(row.original.reviewedAt).toLocaleString('ja-JP') : '-') },
  {
    accessorKey: 'rejectionReason',
    header: '却下理由',
    cell: ({ row }) => {
      const reason = row.original.rejectionReason;
      if (!reason) return '-';
      const UButton = resolveComponent('UButton');
      const UIcon = resolveComponent('UIcon');
      const UPopover = resolveComponent('UPopover');
      const preview = reason.length > 48 ? reason.slice(0, 48) + '…' : reason;
      return h(
        UPopover,
        { mode: 'hover', openDelay: 120, closeDelay: 80 },
        {
          default: () => h(
            UButton,
            { variant: 'ghost', size: 'sm', title: '却下理由を表示', onClick: () => openRejectionView(reason), class: 'px-2' },
            { default: () => h(UIcon, { name: 'i-lucide-info', class: 'text-primary p-3' }) }
          ),
          content: () => h('div', { class: 'max-w-xs p-2 text-sm' }, preview),
        }
      );
    },
  },
  {
    accessorKey: 'actions',
    header: '操作',
    cell: ({ row }) => {
      const request = row.original;
      const UButton = resolveComponent('UButton');
      const canReview = request.status === 'pending';
      const canDelete = request.status !== 'pending';
      return h('div', { class: 'flex flex-wrap gap-2' }, [
        h(UButton, { color: 'primary', variant: 'solid', loading: loading.value, disabled: !canReview, onClick: () => approveRequest(request) }, { default: () => '承認' }),
        h(UButton, { color: 'warning', variant: 'outline', loading: loading.value, disabled: !canReview, onClick: () => openRejectModal(request) }, { default: () => '却下' }),
        h(UButton, { color: 'error', variant: 'solid', loading: loading.value, disabled: !canDelete, onClick: () => deleteRequest(request) }, { default: () => '削除' }),
      ]);
    },
  },
];

async function fetchRequests() {
  loading.value = true;
  try {
    const { requests: data, total: totalCount } = await $fetch<{ requests: RegistrationRequest[]; total: number }>('/api/pitamai/register-requests', {
      query: {
        limit: state.limit,
        offset: state.offset,
        startAt: dateFilter.start ? dateFilter.start.toISOString() : undefined,
        endAt: dateFilter.end ? dateFilter.end.toISOString() : undefined,
      },
    });
    requests.value = Array.isArray(data) ? data : [];
    total.value = typeof totalCount === 'number' ? totalCount : data?.length;
  } catch (error: any) {
    console.error('register request fetch error:', error);
    toast.add({
      title: 'エラー',
      description: error?.data?.message ?? error?.message ?? '申請一覧の取得に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function approveRequest(request: RegistrationRequest) {
  const confirmed = await confirmDialog(`${request.email} を承認しますか？`);
  if (!confirmed) return;

  loading.value = true;
  try {
    await $fetch(`/api/pitamai/register-requests/${request.id}/approve`, {
      method: 'POST',
    });

    toast.add({
      title: '承認しました',
      description: `${request.email} を承認しました`,
      color: 'success',
    });
    await fetchRequests();
  } catch (error) {
    const apiError = error as ApiErrorLike;
    toast.add({
      title: 'エラー',
      description: apiError?.data?.message ?? apiError?.message ?? '承認に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

function openRejectModal(request: RegistrationRequest) {
  pendingRejectRequest.value = request;
  rejectReasonDraft.value = '';
  rejectModalOpen.value = true;
}

async function submitReject() {
  if (!pendingRejectRequest.value) return;

  loading.value = true;
  try {
    const currentRequest = pendingRejectRequest.value;
    await $fetch(`/api/pitamai/register-requests/${currentRequest.id}/reject`, {
      method: 'POST',
      body: { rejectionReason: rejectReasonDraft.value },
    });

    toast.add({
      title: '却下しました',
      description: `${currentRequest.email} を却下しました`,
      color: 'success',
    });
    rejectModalOpen.value = false;
    pendingRejectRequest.value = null;
    await fetchRequests();
  } catch (error) {
    const apiError = error as ApiErrorLike;
    toast.add({
      title: 'エラー',
      description: apiError?.data?.message ?? apiError?.message ?? '却下に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function deleteRequest(request: RegistrationRequest) {
  const confirmed = await confirmDialog(`${request.email} の申請を完全に削除しますか？`, '削除確認');
  if (!confirmed) return;

  loading.value = true;
  try {
    await $fetch(`/api/pitamai/register-requests/${request.id}/delete`, {
      method: 'POST',
    });

    toast.add({
      title: '削除しました',
      description: `${request.email} の申請を削除しました`,
      color: 'success',
    });
    await fetchRequests();
  } catch (error) {
    const apiError = error as ApiErrorLike;
    toast.add({
      title: 'エラー',
      description: apiError?.data?.message ?? apiError?.message ?? '削除に失敗しました',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (route.query.id) {
    tableFilter.value = String(route.query.id);
  }
  await fetchRequests();
});
</script>

<template>
  <div>
    <AppBackgroundCard class="mx-auto w-full space-y-5">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold">登録審査</h1>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          新規申請を確認して、承認・却下・再審査・削除を行えます。
        </p>
      </div>

      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          件数: <span class="font-medium">{{ total ?? requests.length }}</span>
        </p>
        <UButton variant="ghost" :loading="loading" @click="fetchRequests">
          更新
        </UButton>
      </div>

      <AppDateRangePicker v-model="calendarRange" :clear-disabled="!tableFilter && !dateFilter.start && !dateFilter.end"
        @clear="resetFilters" class="mb-4" />

      <div class="flex items-center gap-2 justify-between mb-8">
        <UInput v-model="tableFilter" placeholder="メール、名前、Discord ID で検索" class="flex-1 max-w-lg" />
      </div>

      <div class="overflow-auto">
        <UTable :data="requests" :columns="columns" :loading="loading" v-model:global-filter="tableFilter"
          empty="申請がありません。" :ui="{
            td: 'align-top py-3 whitespace-nowrap',
            th: 'text-xs font-medium text-gray-500 dark:text-gray-400',
            tr: 'hover:bg-gray-50/60 dark:hover:bg-gray-900/30',
          }" />
      </div>

      <AppPaginationBar v-model:page="currentPage" :total="total ?? 0" :items-per-page="state.limit" />

      <TheConfirmModal />

      <UModal v-model:open="rejectModalOpen" title="却下理由" :ui="{ footer: 'justify-end' }">
        <template #body>
          <div class="space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ pendingRejectRequest?.email }} を却下します。必要なら理由を入力してください。
            </p>
            <UFormField label="却下理由">
              <UTextarea v-model="rejectReasonDraft" :rows="4" class="w-full" placeholder="却下理由を入力してください" />
            </UFormField>
          </div>
        </template>

        <template #footer="{ close }">
          <UButton variant="ghost" :disabled="loading" @click="close()">
            キャンセル
          </UButton>
          <UButton color="warning" :loading="loading" @click="submitReject">
            却下する
          </UButton>
        </template>
      </UModal>
      <UModal v-model:open="rejectionViewOpen" title="却下理由" :ui="{ footer: 'justify-end' }">
        <template #body>
          <div class="whitespace-pre-wrap wrap-break-word text-sm">
            {{ rejectionViewText }}
          </div>
        </template>
        <template #footer="{ close }">
          <UButton variant="ghost" @click="close()">閉じる</UButton>
        </template>
      </UModal>
    </AppBackgroundCard>
  </div>
</template>