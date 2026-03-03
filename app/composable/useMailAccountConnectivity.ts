import type { Ref } from 'vue';
import { useMailApi } from '~/composable/useMailApi';

type MailAccountItem = {
  id: string;
  label: string | null;
  emailAddress: string;
};

type UseMailAccountConnectivityParams = {
  hasMailSetting: Ref<boolean>;
};

export function useMailAccountConnectivity(
  params: UseMailAccountConnectivityParams
) {
  const toast = useToast();
  const serverError = useError();
  const mailApi = useMailApi();

  const accounts = ref<MailAccountItem[]>([]);
  const imapReachable = ref<boolean | null>(null);
  const smtpReachable = ref<boolean | null>(null);
  let connectivityTimer: ReturnType<typeof setInterval> | null = null;

  const selectedAccount = computed(() => accounts.value[0] ?? null);

  const showMailSettingAlert = computed(() => {
    if (!params.hasMailSetting.value) return true;
    return imapReachable.value === false || smtpReachable.value === false;
  });

  const mailSettingAlertDescription = computed(() => {
    if (!params.hasMailSetting.value) {
      return '個人設定ページで IMAP/SMTP を登録してください。';
    }

    if (imapReachable.value === false || smtpReachable.value === false) {
      return 'IMAP/SMTP の疎通に失敗しています。設定を確認してください。';
    }

    return '個人設定ページで IMAP/SMTP の設定をご確認ください。';
  });

  async function loadAccounts() {
    try {
      const response = await mailApi.getAccounts();
      accounts.value = response.accounts;
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー';
      toast.add({
        title: 'エラー',
        description: `${message} メールアカウント取得に失敗しました`,
        color: 'error',
      });
    }
  }

  async function checkMailConnectivity() {
    if (!params.hasMailSetting.value) {
      imapReachable.value = null;
      smtpReachable.value = null;
      return;
    }

    const [imapResult, smtpResult] = await Promise.allSettled([
      mailApi.testImapConnection(),
      mailApi.testSmtpConnection(),
    ]);

    imapReachable.value = imapResult.status === 'fulfilled';
    smtpReachable.value = smtpResult.status === 'fulfilled';
  }

  function startConnectivityPolling() {
    if (connectivityTimer) {
      clearInterval(connectivityTimer);
    }

    connectivityTimer = setInterval(
      () => {
        checkMailConnectivity();
      },
      12 * 60 * 60 * 1000
    );
  }

  function stopConnectivityPolling() {
    if (!connectivityTimer) return;
    clearInterval(connectivityTimer);
    connectivityTimer = null;
  }

  return {
    accounts,
    selectedAccount,
    imapReachable,
    smtpReachable,
    showMailSettingAlert,
    mailSettingAlertDescription,
    loadAccounts,
    checkMailConnectivity,
    startConnectivityPolling,
    stopConnectivityPolling,
  };
}
