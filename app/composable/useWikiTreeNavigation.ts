import type { TreeItem } from '@nuxt/ui';

import { useWikiList } from '~/composable/useWikiList';

type WikiTreeItem = TreeItem & {
  id: string;
  to?: string;
};

export const useWikiTreeNavigation = () => {
  const route = useRoute();
  const router = useRouter();

  const { data, pending, error, activeOrganizationId } = useWikiList();

  const wikiTreeItems = computed<WikiTreeItem[]>(() => {
    const orgId = activeOrganizationId.value;
    if (!orgId) return [];

    const wikis = data.value?.wikis ?? [];

    return [
      {
        id: `wiki:${orgId}:list`,
        label: '一覧',
        icon: 'i-lucide-list',
        to: `/apps/organization/wiki/${orgId}`,
      },
      {
        id: `wiki:${orgId}:new`,
        label: '新規作成',
        icon: 'i-lucide-plus-circle',
        to: `/apps/organization/wiki/${orgId}/new`,
      },
      {
        id: `wiki:${orgId}:notes`,
        label: 'wiki',
        icon: 'i-lucide-notebook-text',
        defaultExpanded: true,
        children: wikis.map(w => ({
          id: `wiki:${orgId}:${w.id}`,
          label: w.title,
          icon: 'i-lucide-file-text',
          to: `/apps/organization/wiki/${orgId}/${w.id}`,
        })),
      },
    ];
  });

  const wikiTreeValue = ref<WikiTreeItem | undefined>(undefined);

  function findById(
    items: WikiTreeItem[],
    id: string
  ): WikiTreeItem | undefined {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children?.length) {
        const found = findById(item.children as WikiTreeItem[], id);
        if (found) return found;
      }
    }
    return undefined;
  }

  const selectedId = computed(() => {
    const orgId = activeOrganizationId.value;
    if (!orgId) return null;
    if (route.params.id !== orgId) return null;

    if (route.path === `/apps/organization/wiki/${orgId}`) {
      return `wiki:${orgId}:list`;
    }

    if (route.path === `/apps/organization/wiki/${orgId}/new`) {
      return `wiki:${orgId}:new`;
    }

    const wikiId = route.params.wikiId;
    if (typeof wikiId === 'string' && wikiId) {
      return `wiki:${orgId}:${wikiId}`;
    }

    return null;
  });

  watchEffect(() => {
    const id = selectedId.value;
    if (!id) {
      wikiTreeValue.value = undefined;
      return;
    }

    wikiTreeValue.value = findById(wikiTreeItems.value, id);
  });

  function getKey(item: WikiTreeItem) {
    return item.id;
  }

  function onSelect(_e: unknown, item: WikiTreeItem) {
    if (item.to) {
      router.push(item.to);
    }
  }

  return {
    wikiTreeItems,
    wikiTreePending: pending,
    wikiTreeError: error,
    activeOrganizationId,
    wikiTreeValue,
    getWikiTreeKey: getKey,
    onWikiTreeSelect: onSelect,
  };
};
