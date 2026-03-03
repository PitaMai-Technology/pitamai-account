import type { ComputedRef, Ref } from 'vue';
import type { MailListItem } from '~/stores/mail';

type MailGroup = {
  key: string;
  sender: string;
  messages: MailListItem[];
};

type UseMailSearchParams = {
  mailList: Ref<MailListItem[]>;
  groupedMailList: ComputedRef<MailGroup[]>;
};

export function useMailSearch(params: UseMailSearchParams) {
  const searchQuery = ref('');
  const normalizedSearchQuery = computed(() =>
    searchQuery.value.trim().toLowerCase()
  );

  const filteredMailList = computed(() => {
    const query = normalizedSearchQuery.value;
    if (!query) {
      return params.mailList.value;
    }

    return params.mailList.value.filter(item => {
      const subject = (item.subject ?? '').toLowerCase();
      const from = (item.from ?? '').toLowerCase();

      return subject.includes(query) || from.includes(query);
    });
  });

  const filteredGroupedMailList = computed(() => {
    const query = normalizedSearchQuery.value;
    if (!query) {
      return params.groupedMailList.value;
    }
    const visibleUidSet = new Set(filteredMailList.value.map(item => item.uid));

    return params.groupedMailList.value
      .map(group => ({
        ...group,
        messages: group.messages.filter(message =>
          visibleUidSet.has(message.uid)
        ),
      }))
      .filter(group => group.messages.length > 0);
  });

  return {
    searchQuery,
    filteredMailList,
    filteredGroupedMailList,
  };
}
