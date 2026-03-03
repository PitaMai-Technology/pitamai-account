import type { Ref } from 'vue';
import type { MailFolder } from '~/stores/mail';

type UseMailFolderRouteSyncParams = {
  hasMailSetting: Ref<boolean>;
  folders: Ref<MailFolder[]>;
  activeFolderPath: Ref<string>;
  setActiveFolder: (path: string) => void;
  loadMessages: (options?: {
    markOpenedAsRead?: boolean;
    notifyIfNew?: boolean;
    forceSync?: boolean;
  }) => Promise<void>;
};

export function useMailFolderRouteSync(params: UseMailFolderRouteSyncParams) {
  const route = useRoute();
  const router = useRouter();

  function getQueryFolderParam() {
    const queryFolder = route.query.f;
    if (typeof queryFolder !== 'string') return null;
    const normalized = queryFolder.trim();
    return normalized.length > 0 ? normalized : null;
  }

  function applyFolderFromQuery(): boolean {
    const queryFolder = getQueryFolderParam();
    if (!queryFolder) return false;

    const exists = params.folders.value.some(
      folder => folder.path === queryFolder
    );
    if (!exists) return false;
    if (params.activeFolderPath.value === queryFolder) return false;

    params.setActiveFolder(queryFolder);
    return true;
  }

  watch(params.activeFolderPath, async () => {
    if (!params.hasMailSetting.value) return;

    const currentQueryFolder = getQueryFolderParam();
    if (currentQueryFolder !== params.activeFolderPath.value) {
      await router.replace({
        query: {
          ...route.query,
          f: params.activeFolderPath.value,
        },
      });
    }

    await params.loadMessages({
      markOpenedAsRead: false,
      notifyIfNew: false,
      forceSync: false,
    });
  });

  watch(
    () => route.query.f,
    () => {
      if (!params.hasMailSetting.value) return;
      applyFolderFromQuery();
    }
  );

  return {
    applyFolderFromQuery,
  };
}
