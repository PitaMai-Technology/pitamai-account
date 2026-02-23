import { useMailApi } from '~/composable/useMailApi';
import type { MailDetail, MailListItem } from '~/stores/mail';

// ==============================================================================
// メール一覧・詳細取得とスレッド化処理
// ==============================================================================
// 役割: メール一覧の取得・キャッシュ・自動スレッド化、詳細取得・既読管理
type MailGroup = {
  key: string;
  sender: string;
  messages: MailListItem[];
};

type UseMailMessagesParams = {
  hasMailSetting: Ref<boolean>;
  activeFolderPath: Ref<string>;
  mailList: Ref<MailListItem[]>;
  currentMail: Ref<MailDetail | null>;
  selectedUid: Ref<number | null>;
  openingUid: Ref<number | null>;
  isLoading: Ref<boolean>;
  setMailList: (items: MailListItem[]) => void;
  setCurrentMail: (mail: MailDetail | null) => void;
  selectUid: (uid: number | null) => void;
  getCachedMailList: (folderPath: string) => MailListItem[] | null;
  setCachedMailList: (folderPath: string, items: MailListItem[]) => void;
  getCachedMailDetail: (folderPath: string, uid: number) => MailDetail | null;
  setCachedMailDetail: (folderPath: string, mail: MailDetail) => void;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function useMailMessages(params: UseMailMessagesParams) {
  const toast = useToast();
  const mailApi = useMailApi();

  const lastRealtimeToastAt = ref(0);
  const lastKnownTopUid = ref<number | null>(null);
  const listAbortController = ref<AbortController | null>(null);
  const openAbortController = ref<AbortController | null>(null);
  let latestLoadRequestId = 0;
  let latestOpenRequestId = 0;

  function isAbortError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const maybeError = error as {
      name?: string;
      cause?: { name?: string };
    };

    return (
      maybeError.name === 'AbortError' ||
      maybeError.cause?.name === 'AbortError'
    );
  }

  const selectedMessage = computed(() => {
    if (params.selectedUid.value === null) return null;
    return (
      params.mailList.value.find(
        item => item.uid === params.selectedUid.value
      ) ?? null
    );
  });

  const selectedSeen = computed(() => selectedMessage.value?.seen ?? null);
  const hasSelectedMail = computed(() => params.selectedUid.value !== null);

  function extractSenderAddress(from: string | null) {
    if (!from) return 'unknown';

    const matched = from.match(/<([^>]+)>/);
    if (matched?.[1]) {
      return matched[1].trim().toLowerCase();
    }

    return from.trim().toLowerCase();
  }

  // 日本語コメント: 返信スレッド判定
  // - Re: / Re[n]: の返信件名パターンのみ抽出
  // - 転送（Fwd: など）や通常件名は対象外にして誤グループ化を防ぎます
  // - 返信判定が成功した場合のみスレッド化ロジックへ進みます
  function isReplySubject(subject: string | null) {
    if (!subject) return false;
    return /^re(\[\d+\])?\s*:/i.test(subject.trim());
  }

  function normalizeThreadSubject(subject: string | null) {
    const raw = (subject ?? '').trim();
    if (!raw) return '(件名なし)';

    let normalized = raw;
    while (/^re(\[\d+\])?\s*:/i.test(normalized)) {
      normalized = normalized.replace(/^re(\[\d+\])?\s*:/i, '').trim();
    }

    return normalized.toLowerCase() || '(件名なし)';
  }

  // 日本語コメント: 24時間以内判定（スレッド化の時間条件）
  // - 返信スレッドが同一送信者・同一件名でも、24時間を超える古い返信は別グループに分離
  // - 古いメールスレッドと新しいメールスレッドを混同して表示しないための時間境界
  // - 例: 先週のやりとりと今週のやりとりは別グループとして管理
  function isWithinOneDay(dateText: string | null) {
    if (!dateText) return false;

    const time = new Date(dateText).getTime();
    if (Number.isNaN(time)) return false;

    return Date.now() - time <= ONE_DAY_MS;
  }

  // 日本語コメント: メール一覧のグループ化（スレッド化）
  // - 同一送信者からの返信で、24時間以内、同じ正規化件名を持つメールをグループ化
  // - スレッド化条件: sender + 返信判定 + 時間枠が全て揃ってはじめてグループ対象
  // - 条件を満たさないメールは単独グループとして表示（スレッド化されない）
  // - グループ化により、返信メールを収束表示して一覧を見やすくします
  const groupedMailList = computed<MailGroup[]>(() => {
    const groups: MailGroup[] = [];
    const threadGroupIndex = new Map<string, number>();

    for (const message of params.mailList.value) {
      const senderKey = extractSenderAddress(message.from);
      const replyThreadingEnabled =
        senderKey !== 'unknown' &&
        isReplySubject(message.subject) &&
        isWithinOneDay(message.date);

      if (replyThreadingEnabled) {
        const threadKey = `${senderKey}:${normalizeThreadSubject(message.subject)}`;
        const existingIndex = threadGroupIndex.get(threadKey);

        if (existingIndex !== undefined) {
          const existing = groups[existingIndex];
          if (existing) {
            existing.messages.push(message);
          }
          continue;
        }

        threadGroupIndex.set(threadKey, groups.length);
        groups.push({
          key: `thread:${threadKey}`,
          sender: message.from || '-',
          messages: [message],
        });
        continue;
      }

      groups.push({
        key: `single:${message.uid}`,
        sender: message.from || '-',
        messages: [message],
      });
    }

    return groups;
  });

  function maybeNotifyNewMail() {
    const now = Date.now();
    if (now - lastRealtimeToastAt.value < 5000) {
      return;
    }

    lastRealtimeToastAt.value = now;
    toast.add({
      title: '新着通知',
      description: '新しいメールが来ています。',
      color: 'info',
    });
  }

  async function openMessage(
    uid: number,
    markAsRead = true,
    folderPath?: string
  ) {
    if (!params.hasMailSetting.value) return;

    const requestFolder = folderPath ?? params.activeFolderPath.value;
    if (!requestFolder) return;

    if (
      params.openingUid.value === uid &&
      params.activeFolderPath.value === requestFolder
    )
      return;

    const cachedDetail = params.getCachedMailDetail(requestFolder, uid);
    if (cachedDetail) {
      params.selectedUid.value = uid;
      params.setCurrentMail(cachedDetail);

      const listItem = params.mailList.value.find(item => item.uid === uid);
      if (markAsRead && listItem && !listItem.seen) {
        await mailApi.updateSeen(requestFolder, uid, true);
        listItem.seen = true;
      }
      return;
    }

    if (openAbortController.value) {
      openAbortController.value.abort();
    }

    const controller = new AbortController();
    openAbortController.value = controller;
    const requestId = ++latestOpenRequestId;

    try {
      params.openingUid.value = uid;
      params.selectedUid.value = uid;
      const listItem = params.mailList.value.find(item => item.uid === uid);

      const response = await mailApi.getMessage({
        folder: requestFolder,
        uid,
        signal: controller.signal,
      });

      if (requestId !== latestOpenRequestId) {
        return;
      }

      if (params.activeFolderPath.value !== requestFolder) {
        return;
      }

      params.setCurrentMail(response.message);
      params.setCachedMailDetail(requestFolder, response.message);

      // 日本語コメント: 詳細を開いたタイミングでのみ既読APIを呼び、一覧読み込みだけでは既読化しないよう制御します。
      if (markAsRead && listItem && !listItem.seen) {
        await mailApi.updateSeen(requestFolder, uid, true);

        const target = params.mailList.value.find(item => item.uid === uid);
        if (target) {
          target.seen = true;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      toast.add({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'メール詳細取得に失敗しました',
        color: 'error',
      });
    } finally {
      if (
        requestId === latestOpenRequestId &&
        params.openingUid.value === uid
      ) {
        params.openingUid.value = null;
      }

      if (openAbortController.value === controller) {
        openAbortController.value = null;
      }
    }
  }

  // 日本語コメント: メール一覧の読み込みと初期化
  // - forceSync=true: サーバーとの同期を強制（手動リフレッシュ時）
  // - forceSync=false: キャッシュ優先で効率化（初期読み込み時）
  // - notifyIfNew=true: SSE接続から新着が来た場合、トースト通知を表示
  // - markOpenedAsRead: 詳細表示時のみ既読化（通常は既読化しない）
  // - 新着メール（UUID > 前回最大ID）を検知する簡易ロジック
  async function loadMessages(options?: {
    markOpenedAsRead?: boolean;
    notifyIfNew?: boolean;
    forceSync?: boolean;
  }) {
    const markOpenedAsRead = options?.markOpenedAsRead ?? false;
    const notifyIfNew = options?.notifyIfNew ?? false;
    const forceSync = options?.forceSync ?? false;

    if (!params.hasMailSetting.value) return;

    const requestFolder = params.activeFolderPath.value;
    if (!requestFolder) return;

    if (!forceSync) {
      const cachedList = params.getCachedMailList(requestFolder);
      if (cachedList) {
        params.setMailList(cachedList);

        if (cachedList.length > 0) {
          const selected =
            params.selectedUid.value !== null
              ? cachedList.find(item => item.uid === params.selectedUid.value)
              : null;

          const target = selected ?? cachedList[0];
          if (target) {
            const isSameAsCurrent =
              params.currentMail.value?.uid === target.uid &&
              params.selectedUid.value === target.uid;

            if (!isSameAsCurrent) {
              await openMessage(target.uid, markOpenedAsRead, requestFolder);
            }
          }
        } else {
          params.setCurrentMail(null);
          params.selectUid(null);
        }

        return;
      }
    }

    if (listAbortController.value) {
      listAbortController.value.abort();
    }

    const listController = new AbortController();
    listAbortController.value = listController;
    const requestId = ++latestLoadRequestId;

    try {
      params.isLoading.value = true;

      if (openAbortController.value) {
        openAbortController.value.abort();
      }

      const response = await mailApi.getMessages({
        folder: requestFolder,
        limit: 50,
        forceSync,
        signal: listController.signal,
      });

      if (requestId !== latestLoadRequestId) {
        return;
      }

      if (params.activeFolderPath.value !== requestFolder) {
        return;
      }

      const nextTopUid = response.messages[0]?.uid ?? null;
      const prevTopUid = lastKnownTopUid.value;

      if (
        notifyIfNew &&
        prevTopUid !== null &&
        nextTopUid !== null &&
        nextTopUid > prevTopUid
      ) {
        maybeNotifyNewMail();
      }

      lastKnownTopUid.value = nextTopUid;

      params.setMailList(response.messages);
      params.setCachedMailList(requestFolder, response.messages);

      if (response.messages.length > 0) {
        const selected =
          params.selectedUid.value !== null
            ? response.messages.find(
                item => item.uid === params.selectedUid.value
              )
            : null;

        const target = selected ?? response.messages[0];
        if (target) {
          const isSameAsCurrent =
            params.currentMail.value?.uid === target.uid &&
            params.selectedUid.value === target.uid;

          if (!isSameAsCurrent) {
            await openMessage(target.uid, markOpenedAsRead, requestFolder);
          }
        }
      } else {
        params.setCurrentMail(null);
        params.selectUid(null);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      toast.add({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'メール一覧取得に失敗しました',
        color: 'error',
      });
    } finally {
      if (requestId === latestLoadRequestId) {
        params.isLoading.value = false;
      }

      if (listAbortController.value === listController) {
        listAbortController.value = null;
      }
    }
  }

  async function onToggleSeen() {
    if (!hasSelectedMail.value || selectedSeen.value === null) return;

    const uid = params.selectedUid.value;
    if (uid === null) return;

    try {
      const listItem = params.mailList.value.find(item => item.uid === uid);
      if (!listItem) return;

      const newSeenState = !selectedSeen.value;

      await mailApi.updateSeen(
        params.activeFolderPath.value,
        uid,
        newSeenState
      );

      // メモリ上の状態を即座に更新
      listItem.seen = newSeenState;

      // キャッシュを更新
      params.setCachedMailList(
        params.activeFolderPath.value,
        params.mailList.value
      );

      // キャッシュをバイパスして最新を取得
      await loadMessages({ forceSync: true });
    } catch (error) {
      toast.add({
        title: 'エラー',
        description:
          error instanceof Error ? error.message : '既読更新に失敗しました',
        color: 'error',
      });
    }
  }

  return {
    groupedMailList,
    selectedSeen,
    hasSelectedMail,
    maybeNotifyNewMail,
    loadMessages,
    openMessage,
    onToggleSeen,
  };
}
