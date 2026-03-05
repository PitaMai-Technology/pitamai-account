<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

definePageMeta({
  layout: 'the-app',
});

const sessionRef = authClient.useSession();

const organizations = authClient.useListOrganizations();

const toast = useToast();
const linkedClients = ref<
  Array<{
    id: string;
    clientId: string;
    clientName: string;
    scope: string;
    createdAt?: Date | string;
    uri?: string;
  }>
>([]);
const isLinkedClientsLoading = ref(false);
const revokingConsentId = ref<string | null>(null);

function normalizeClientName(client: unknown, fallback: string) {
  const value =
    (client as { client_name?: string; clientName?: string }).client_name ??
    (client as { client_name?: string; clientName?: string }).clientName;

  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function normalizeClientUri(client: unknown) {
  const value =
    (client as { client_uri?: string; uri?: string }).client_uri ??
    (client as { client_uri?: string; uri?: string }).uri;

  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeConsentScope(consent: unknown) {
  const scope = (consent as { scope?: string }).scope;
  if (typeof scope === 'string') {
    return scope.trim();
  }

  const scopes = (consent as { scopes?: string[] }).scopes;
  if (Array.isArray(scopes)) {
    return scopes.filter(Boolean).join(' ').trim();
  }

  return '';
}

async function refreshLinkedClients() {
  isLinkedClientsLoading.value = true;

  try {
    const { data, error } = await authClient.oauth2.getConsents();

    if (error) {
      toast.add({
        title: '連携先クライアントの取得に失敗しました',
        description: error.message,
        color: 'error',
      });
      linkedClients.value = [];
      return;
    }

    const consents = Array.isArray(data) ? data : [];

    const resolvedClients = await Promise.all(
      consents.map(async consent => {
        const id =
          (consent as { id?: string }).id ??
          (consent as { consent_id?: string }).consent_id ??
          '';
        const clientId =
          (consent as { client_id?: string; clientId?: string }).client_id ??
          (consent as { client_id?: string; clientId?: string }).clientId ??
          '';

        let clientName = clientId;
        let uri: string | undefined;

        if (clientId) {
          const { data: publicClient } = await authClient.oauth2.publicClient({
            query: { client_id: clientId },
          });

          if (publicClient) {
            clientName = normalizeClientName(publicClient, clientId);
            uri = normalizeClientUri(publicClient);
          }
        }

        return {
          id,
          clientId,
          clientName,
          scope: normalizeConsentScope(consent),
          createdAt:
            (consent as { createdAt?: Date | string; created_at?: string }).createdAt ??
            (consent as { createdAt?: Date | string; created_at?: string }).created_at,
          uri,
        };
      }),
    );

    linkedClients.value = resolvedClients.filter(item => Boolean(item.clientId));
  } finally {
    isLinkedClientsLoading.value = false;
  }
}

async function revokeConsent(consentId: string) {
  if (!consentId || revokingConsentId.value) {
    return;
  }

  revokingConsentId.value = consentId;

  try {
    const { error } = await authClient.oauth2.deleteConsent({
      id: consentId,
    });

    if (error) {
      toast.add({
        title: '連携解除に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '連携を解除しました',
      color: 'success',
    });

    await refreshLinkedClients();
  } finally {
    revokingConsentId.value = null;
  }
}

watch(
  () => sessionRef.value.data?.user?.id,
  async userId => {
    if (!userId) {
      linkedClients.value = [];
      return;
    }

    await refreshLinkedClients();
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <div>
      <AppBackgroundCard>
        <!-- ユーザー情報 -->
        <div v-if="sessionRef.data" class="space-y-4">
          <!-- 組織リンク -->
          <UCard>
            <template #header>
              <h2 class="text-lg font-semibold">所属組織</h2>
            </template>
            <div v-if="organizations.isPending" class="flex items-center justify-center py-4">
              <TheLoader />
            </div>
            <div v-else-if="organizations.data && organizations.data.length > 0" class="space-y-2">
              <NuxtLink v-for="org in organizations.data" :key="org.id" :to="`/apps/organization/${org.id}`"
                class="flex items-center justify-between rounded-lg border p-3 transition hover:bg-gray-50">
                <div class="flex items-center space-x-3">
                  <UIcon name="i-lucide-building-2" class="text-gray-400" />
                  <span class="font-medium">{{ org.name }}</span>
                </div>
                <UIcon name="i-lucide-chevron-right" class="text-gray-400" />
              </NuxtLink>
            </div>
            <div v-else class="py-4 text-center text-gray-500">
              所属している組織がありません
            </div>
          </UCard>
          <UCard>
            <template #header>
              <h2 class="text-lg font-semibold">ユーザー情報</h2>
            </template>
            <div class="space-y-2">
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-mail" />
                <span class="font-medium">メール:</span>
                <span>{{
                  sessionRef.data.user.email
                }}</span>
              </div>
              <div v-if="sessionRef.data.user.name" class="flex items-center space-x-2">
                <UIcon name="i-lucide-user" />
                <span class="font-medium">名前:</span>
                <span>{{
                  sessionRef.data.user.name
                }}</span>
              </div>
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-calendar" />
                <span class="font-medium">登録日:</span>
                <span>
                  {{
                    sessionRef.data.user.createdAt
                      ? new Date(
                        sessionRef.data.user.createdAt
                      ).toLocaleDateString('ja-JP')
                      : '-'
                  }}
                </span>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="text-lg font-semibold">連携先クライアント</h2>
            </template>

            <div v-if="isLinkedClientsLoading" class="flex items-center justify-center py-4">
              <TheLoader />
            </div>

            <div v-else-if="linkedClients.length > 0" class="space-y-2">
              <div v-for="client in linkedClients" :key="client.id || client.clientId"
                class="space-y-1 rounded-lg border p-3">
                <div class="flex items-center justify-between gap-4">
                  <p class="font-medium">{{ client.clientName }}</p>
                  <span class="text-xs text-gray-500">{{ client.clientId }}</span>
                </div>

                <p v-if="client.scope" class="text-sm text-gray-600">scope: {{ client.scope }}</p>

                <p v-if="client.createdAt" class="text-xs text-gray-500">
                  連携日: {{ new Date(client.createdAt).toLocaleDateString('ja-JP') }}
                </p>

                <a v-if="client.uri" :href="client.uri" target="_blank" rel="noopener noreferrer"
                  class="text-sm text-primary underline">
                  クライアント情報を開く
                </a>

                <div class="pt-1">
                  <UButton size="xs" color="error" variant="soft" :loading="revokingConsentId === client.id"
                    :disabled="!client.id || revokingConsentId !== null" @click="revokeConsent(client.id)">
                    連携解除
                  </UButton>
                </div>
              </div>
            </div>

            <div v-else class="py-4 text-center text-gray-500">
              連携中のクライアントはありません
            </div>
          </UCard>
        </div>

        <div v-else class="py-12 text-center text-gray-500">
          {{ sessionRef.data ? sessionRef.data : '読み込み中です。' }}
        </div>
      </AppBackgroundCard>
    </div>
  </div>
</template>
