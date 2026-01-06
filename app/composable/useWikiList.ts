import { useActiveOrg } from '~/composable/useActiveOrg';

export type WikiListItem = {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  createdAt: string;
  updatedAt: string;
};

type WikiListResponse = {
  wikis: WikiListItem[];
};

type UseWikiListOptions = {
  /**
   * アクティブ組織が確定したら自動で一覧を取得する。
   * @default true
   */
  autoRefresh?: boolean;
};

export const useWikiList = (options: UseWikiListOptions = {}) => {
  const { autoRefresh = true } = options;

  const activeOrg = useActiveOrg();
  const activeOrganizationId = computed(() => activeOrg.value.data?.id ?? null);
  const isReady = computed(
    () => !activeOrg.value.isPending && !!activeOrganizationId.value
  );

  const { data, pending, error, refresh } = useAsyncData(
    'wiki:list',
    () => $fetch<WikiListResponse>('/api/wiki'),
    {
      immediate: false,
    }
  );

  watch(
    () => isReady.value,
    async ready => {
      if (!autoRefresh) return;
      if (!ready) return;
      await refresh();
    },
    { immediate: true }
  );

  watch(
    () => activeOrganizationId.value,
    async (id, prev) => {
      if (!autoRefresh) return;
      if (!id) return;
      if (id === prev) return;
      await refresh();
    }
  );

  return {
    data,
    pending,
    error,
    refresh,
    activeOrganizationId,
    isReady,
  };
};
