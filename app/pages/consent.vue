<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

definePageMeta({
  layout: 'the-front',
});

const route = useRoute();
const toast = useToast();

const clientId = computed(() => {
  const value = route.query.client_id;
  return typeof value === 'string' ? value : '';
});

const requestedScope = computed(() => {
  const value = route.query.scope;
  return typeof value === 'string' ? value.trim() : '';
});

const scopeItems = computed(() =>
  requestedScope.value
    .split(' ')
    .map(scope => scope.trim())
    .filter(Boolean)
);

type PublicClient = {
  name?: string;
  client_name?: string;
  clientName?: string;
};

const loading = ref(false);
const session = authClient.useSession();
const publicClient = ref<PublicClient | null>(null);
const publicClientError = ref<Error | null>(null);
const publicClientLoading = ref(false);

async function loadPublicClient() {
  if (!clientId.value) {
    publicClient.value = null;
    publicClientError.value = null;
    return;
  }

  publicClientLoading.value = true;
  publicClientError.value = null;

  try {
    const { data, error } = await authClient.oauth2.publicClient({
      query: {
        client_id: clientId.value,
      },
    });

    if (error) {
      throw new Error(error.message || 'クライアント情報の取得に失敗しました');
    }

    publicClient.value = (data ?? null) as PublicClient | null;
  } catch (error) {
    publicClient.value = null;
    publicClientError.value =
      error instanceof Error ? error : new Error('クライアント情報の取得に失敗しました');
  } finally {
    publicClientLoading.value = false;
  }
}

watch(clientId, loadPublicClient, { immediate: true });

const clientDisplayName = computed(() => {
  const client = publicClient.value;

  const value = client?.name ?? client?.client_name ?? client?.clientName;
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return '';
});

const consentErrorMessage = computed(() => {
  if (!clientId.value) {
    return 'client_id が指定されていません。認可リクエストを最初からやり直してください。';
  }

  if (!requestedScope.value) {
    return 'scope が空です。認可リクエストを最初からやり直してください。';
  }

  if (publicClientError.value) {
    return (
      publicClientError.value.message ||
      'クライアント情報の取得に失敗しました。時間をおいて再試行してください。'
    );
  }

  if (publicClientLoading.value) {
    return '';
  }

  if (!publicClient.value) {
    return 'クライアント情報が見つかりませんでした。client_id を確認してください。';
  }

  return '';
});

const canSubmitConsent = computed(() => !loading.value && !consentErrorMessage.value);

async function submitConsent(accept: boolean) {
  if (!canSubmitConsent.value) return;

  // 同意する場合は確認ダイアログを表示
  if (accept) {
    const confirmStore = useConfirmDialogStore();
    const confirmed = await confirmStore.confirm(
      `このアプリケーションと本当に連携しますか？`
    );
    if (!confirmed) {
      return;
    }
  }

  loading.value = true;
  try {
    console.info('[oauth-consent] submit start', {
      accept,
      clientId: clientId.value,
      requestedScope: requestedScope.value,
      hasSession: !!session.value?.data?.user,
      path: route.fullPath,
    });

    const { data, error } = await authClient.oauth2.consent({
      accept,
      scope: accept ? requestedScope.value : undefined,
    });

    if (error) {
      console.error('[oauth-consent] submit error', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        hasSession: !!session.value?.data?.user,
        path: route.fullPath,
      });

      toast.add({
        title: '同意処理に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    console.info('[oauth-consent] submit success', {
      accept,
      clientId: clientId.value,
      path: route.fullPath,
    });

    if (!accept) {
      await navigateTo('/login', { replace: true });
      return;
    }

    toast.add({
      title: accept ? '同意しました' : '拒否しました',
      color: accept ? 'success' : 'warning',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex items-center justify-center gap-4">
    <img src="/pitamai-only-logo.png" class="h-12" alt="PitaMai Logo" />
    <p class="text-xl font-semibold">共通アカウント</p>
  </div>
  <div class="flex items-center justify-center p-4">
    <UPageCard class="w-full max-w-xl">
      <template #title>アプリ連携の確認</template>
      <template #description>
        以下のスコープ(アプリ情報を取得するもの)に対するアクセス許可を確認してください。
      </template>

      <div class="space-y-4">
        <div>
          <p class="text-sm text-neutral-500">クライアントID</p>
          <p class="font-medium break-all">{{ clientId || '-' }}</p>
        </div>

        <div v-if="clientDisplayName">
          <p class="text-sm text-neutral-500">連携しようとしているアプリケーション名</p>
          <p class="font-medium">{{ clientDisplayName }}</p>
        </div>

        <UAlert v-if="consentErrorMessage" color="error" variant="soft" title="同意処理を続行できません"
          :description="consentErrorMessage" />

        <div>
          <p class="text-sm text-neutral-500 mb-2">要求スコープ(アプリ情報を取得するもの)</p>
          <div class="flex flex-wrap gap-2">
            <UBadge v-for="scope in scopeItems" :key="scope" color="neutral" variant="subtle">
              {{ scope }}
            </UBadge>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" :loading="loading" :disabled="!canSubmitConsent"
            @click="submitConsent(false)">
            拒否する
          </UButton>
          <UButton :loading="loading" :disabled="!canSubmitConsent" @click="submitConsent(true)">
            許可する
          </UButton>
        </div>
      </div>
    </UPageCard>
    <LazyTheConfirmModal />
  </div>
</template>
