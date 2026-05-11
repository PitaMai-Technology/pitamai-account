<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'zod';
import { authClient } from '~/composable/auth-client';
import { useConfirmDialogStore } from '~/stores/confirmDialog';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const confirmStore = useConfirmDialogStore();
const loading = ref(false);
const clients = ref<
  Array<{
    client_id: string;
    client_name?: string;
    redirect_uris?: string[];
    require_pkce?: boolean;
    editable_name: string;
    editable_redirect_uri: string;
    editable_require_pkce: boolean;
    token_endpoint_auth_method?: string;
    scope?: string;
    editable_scope_text: string;
    disabled?: boolean;
  }>
>([]);

const justIssuedSecret = ref<string | null>(null);

const schema = z.object({
  clientName: z.string().trim().min(1, 'クライアント名は必須です'),
  redirectUri: z.url('有効なリダイレクトURIを入力してください'),
  scopesText: z.string().trim().min(1, 'スコープを1つ以上入力してください'),
  isPublicClient: z.boolean().default(false),
  requirePkce: z.boolean(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  clientName: '',
  redirectUri: '',
  scopesText: 'openid profile email',
  isPublicClient: false,
  requirePkce: false,
});

const scopeItems = ref(['openid', 'profile', 'email', 'offline_access']);

const createScopesModel = computed<string[]>({
  get: () => parseScopes(state.scopesText),
  set: value => {
    state.scopesText = normalizeScopesValue(value).join(' ');
  },
});

function parseScopes(scopesText: string) {
  return scopesText
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function normalizeScopesValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => String(item).trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function upsertScopeItem(scope: string) {
  const normalized = scope.trim();
  if (!normalized) return;

  if (!scopeItems.value.includes(normalized)) {
    scopeItems.value.push(normalized);
  }
}

function onCreateScopeItem(item: string) {
  upsertScopeItem(item);
}

function updateClientScopes(client: { editable_scope_text: string }, value: unknown) {
  const scopes = normalizeScopesValue(value);
  client.editable_scope_text = scopes.join(' ');

  scopes.forEach(upsertScopeItem);
}

function normalizeScopeText(item: unknown) {
  const record = item as { scope?: string; scopes?: string[] };
  if (typeof record.scope === 'string' && record.scope.trim().length > 0) {
    return record.scope.trim();
  }

  if (Array.isArray(record.scopes)) {
    return record.scopes.filter(Boolean).join(' ').trim();
  }

  return '';
}

async function refreshClients() {
  loading.value = true;
  try {
    const { data, error } = await authClient.oauth2.getClients();

    if (error) {
      const description =
        error.status === 401
          ? 'セッションが無効です。再ログイン後に再読み込みしてください。'
          : error.message;
      toast.add({
        title: '取得に失敗しました(GetClients)',
        description,
        color: 'error',
      });
      return;
    }

    const list = Array.isArray(data) ? data : [];
    clients.value = list.map(item => {
      const tokenEndpointAuthMethod =
        (item as {
          token_endpoint_auth_method?: string;
          tokenEndpointAuthMethod?: string;
        }).token_endpoint_auth_method ??
        (item as {
          token_endpoint_auth_method?: string;
          tokenEndpointAuthMethod?: string;
        }).tokenEndpointAuthMethod;

      const rawRequirePkce =
        (item as { require_pkce?: boolean; requirePKCE?: boolean }).require_pkce ??
        (item as { require_pkce?: boolean; requirePKCE?: boolean }).requirePKCE;

      const resolvedRequirePkce =
        typeof rawRequirePkce === 'boolean'
          ? rawRequirePkce
          : tokenEndpointAuthMethod === 'none'
            ? true
            : false;

      return {
        client_id:
          (item as { client_id?: string; clientId?: string }).client_id ??
          (item as { client_id?: string; clientId?: string }).clientId ??
          '',
        client_name:
          (item as { client_name?: string; clientName?: string }).client_name ??
          (item as { client_name?: string; clientName?: string }).clientName,
        redirect_uris:
          (item as { redirect_uris?: string[]; redirectUris?: string[] })
            .redirect_uris ??
          (item as { redirect_uris?: string[]; redirectUris?: string[] })
            .redirectUris,
        require_pkce: resolvedRequirePkce,
        editable_name:
          (item as { client_name?: string; clientName?: string }).client_name ??
          (item as { client_name?: string; clientName?: string }).clientName ??
          '',
        editable_redirect_uri:
          (item as { redirect_uris?: string[]; redirectUris?: string[] })
            .redirect_uris?.[0] ??
          (item as { redirect_uris?: string[]; redirectUris?: string[] })
            .redirectUris?.[0] ??
          '',
        editable_require_pkce: resolvedRequirePkce,
        token_endpoint_auth_method: tokenEndpointAuthMethod,
        scope: normalizeScopeText(item),
        editable_scope_text: normalizeScopeText(item),
        disabled: (item as { disabled?: boolean }).disabled,
      };
    });

    clients.value
      .flatMap(client => parseScopes(client.editable_scope_text))
      .forEach(upsertScopeItem);
  } finally {
    loading.value = false;
  }
}

async function onCreateClient(event: FormSubmitEvent<Schema>) {
  if (loading.value) return;

  loading.value = true;
  justIssuedSecret.value = null;

  try {
    const scopes = parseScopes(event.data.scopesText);
    if (scopes.length === 0) {
      toast.add({
        title: '入力エラー',
        description: 'スコープを1つ以上入力してください',
        color: 'warning',
      });
      return;
    }
    const { data, error } = await authClient.oauth2.createClient({
      client_name: event.data.clientName,
      redirect_uris: [event.data.redirectUri],
      scope: scopes.join(' '),
      token_endpoint_auth_method: event.data.isPublicClient
        ? 'none'
        : 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });

    if (error) {
      toast.add({
        title: '作成に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    const createdClientId =
      (data as { client_id?: string; clientId?: string } | null)?.client_id ??
      (data as { client_id?: string; clientId?: string } | null)?.clientId;

    justIssuedSecret.value =
      (data as { client_secret?: string } | null)?.client_secret ?? null;

    if (createdClientId) {
      try {
        await $fetch('/api/pitamai/require-pkce', {
          method: 'POST',
          body: {
            clientId: createdClientId,
            requirePkce: event.data.isPublicClient ? true : event.data.requirePkce,
          },
        });
      } catch (pkceError) {
        await refreshClients();
        toast.add({
          title: 'PKCE設定の更新に失敗しました（部分成功）',
          description:
            pkceError instanceof Error
              ? pkceError.message
              : 'PKCE設定を更新できませんでした',
          color: 'error',
        });
        return;
      }
    }

    toast.add({
      title: 'OAuthクライアントを作成しました',
      color: 'success',
    });

    state.clientName = '';
    state.redirectUri = '';
    state.scopesText = 'openid profile email';
    state.isPublicClient = false;
    state.requirePkce = false;

    await refreshClients();
  } catch (error) {
    const message = error instanceof Error ? error.message : '作成に失敗しました';
    toast.add({
      title: '作成に失敗しました',
      description: message,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function onDeleteClient(clientId: string) {
  if (!clientId || loading.value) return;

  const client = clients.value.find(c => c.client_id === clientId);
  const confirmed = await confirmStore.confirm(
    `このOAuthクライアント、「 ${client?.client_name ?? clientId} 」を削除します。よろしいですか？`,
    `OAuthクライアント削除 「 ${client?.client_name ?? clientId} 」`
  );
  if (!confirmed) {
    return;
  }

  loading.value = true;
  try {
    const { error } = await authClient.oauth2.deleteClient({
      client_id: clientId,
    });

    if (error) {
      toast.add({
        title: '削除に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: 'OAuthクライアントを削除しました',
      color: 'success',
    });

    await refreshClients();
  } finally {
    loading.value = false;
  }
}

async function onRotateSecret(clientId: string) {
  if (!clientId || loading.value) return;

  const confirmed = await confirmStore.confirm(
    'client_secret を再発行します。現在のシークレットは無効になります。よろしいですか？',
    'シークレット再発行'
  );
  if (!confirmed) {
    return;
  }

  loading.value = true;
  justIssuedSecret.value = null;

  try {
    const { data, error } = await authClient.oauth2.client.rotateSecret({
      client_id: clientId,
    });

    if (error) {
      toast.add({
        title: 'シークレット再発行に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    justIssuedSecret.value =
      (data as { client_secret?: string } | null)?.client_secret ?? null;

    toast.add({
      title: 'シークレットを再発行しました',
      color: 'success',
    });
  } finally {
    loading.value = false;
  }
}

async function onUpdateClient(client: {
  client_id: string;
  editable_name: string;
  editable_redirect_uri: string;
  editable_scope_text: string;
  editable_require_pkce: boolean;
  token_endpoint_auth_method?: string;
}) {
  if (!client.client_id || loading.value) return;

  if (!client.editable_name.trim()) {
    toast.add({
      title: '入力エラー',
      description: 'クライアント名を入力してください',
      color: 'warning',
    });
    return;
  }

  if (!z.string().url().safeParse(client.editable_redirect_uri).success) {
    toast.add({
      title: '入力エラー',
      description: '有効なリダイレクトURIを入力してください',
      color: 'warning',
    });
    return;
  }

  const scopes = parseScopes(client.editable_scope_text);
  if (scopes.length === 0) {
    toast.add({
      title: '入力エラー',
      description: 'スコープを1つ以上入力してください',
      color: 'warning',
    });
    return;
  }
  const scope = scopes.join(' ');

  const updatePayload = {
    client_id: client.client_id,
    update: {
      client_name: client.editable_name.trim(),
      redirect_uris: [client.editable_redirect_uri],
      scope,
    },
  } as Parameters<typeof authClient.oauth2.updateClient>[0];

  loading.value = true;
  try {
    const { error } = await authClient.oauth2.updateClient(updatePayload);

    if (error) {
      toast.add({
        title: '更新に失敗しました',
        description: error.message,
        color: 'error',
      });
      return;
    }

    try {
      await $fetch('/api/pitamai/require-pkce', {
        method: 'POST',
        body: {
          clientId: client.client_id,
          requirePkce: client.editable_require_pkce,
        },
      });
    } catch (pkceError) {
      await refreshClients();
      toast.add({
        title: 'PKCE設定の更新に失敗しました（部分成功）',
        description: pkceError instanceof Error ? pkceError.message : 'PKCE設定を更新できませんでした',
        color: 'error',
      });
      return;
    }

    toast.add({
      title: 'OAuthクライアントを更新しました',
      color: 'success',
    });

    await refreshClients();
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新に失敗しました';
    toast.add({
      title: '更新に失敗しました',
      description: message,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await refreshClients();
});
</script>

<template>
  <AppBackgroundCard>
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold">OAuthクライアント管理</h1>
        <p class="text-sm text-neutral-500 mt-1 mb-4">
          OIDC連携用クライアントを作成・管理します。(誰でも作れます。管理者の承認などは不要です)
        </p>
        <UButton icon="i-lucide-info" color="info" variant="outline" size="md"
          to="https://outline-wiki.pitamai.com/s/4965015d-d59e-4f45-9c9e-3b1992d945d8/doc/oauth-exwsnnFx3h"
          target="_blank">ヘルプ(wiki)</UButton>
      </div>

      <div
        class="max-w-2xl bg-neutral-50 dark:bg-neutral-800/50 p-6 rounded-2xl border border-neutral-100 dark:border-neutral-800">
        <UForm :schema="schema" :state="state" class="space-y-6" @submit="onCreateClient">
          <UFormField label="クライアント名" name="clientName" required description="ユーザーに表示される名称です">
            <UInput class="w-full max-w-md" v-model="state.clientName" placeholder="例: マイ・ウェブアプリ" block />
          </UFormField>

          <UFormField label="リダイレクトURI" name="redirectUri" required description="認証後の戻り先URL">
            <UInput class="w-full max-w-md" v-model="state.redirectUri" placeholder="https://app.example.com/callback"
              block />
          </UFormField>

          <UFormField label="許可スコープ" name="scopesText" required>
            <UInputMenu v-model="createScopesModel" multiple create-item :items="scopeItems" placeholder="スコープを選択または追加"
              block @create="onCreateScopeItem" />
          </UFormField>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div
              class="flex items-center justify-between p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800">
              <div class="flex flex-col">
                <span class="text-sm font-medium">Public Client</span>
                <span class="text-[10px] text-neutral-500 line-clamp-1">シークレットなし&PKCE必須</span>
              </div>
              <USwitch v-model="state.isPublicClient" />
            </div>

            <div
              class="flex items-center justify-between p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800"
              :class="{ 'opacity-50': state.isPublicClient }">
              <div class="flex flex-col">
                <span class="text-sm font-medium">PKCE 必須</span>
                <span class="text-[10px] text-neutral-500 line-clamp-1">より安全な認証（推奨）</span>
              </div>
              <USwitch v-model="state.requirePkce" :disabled="state.isPublicClient" />
            </div>
          </div>

          <div class="flex justify-end">
            <UButton type="submit" icon="i-lucide-plus" :loading="loading" size="lg" class="px-8">
              クライアントを作成
            </UButton>
          </div>
        </UForm>
      </div>

      <UAlert v-if="justIssuedSecret" color="warning" variant="solid">
        <template #title>
          client_secret はこの表示時のみ確認できます
        </template>
        <template #description>
          <AppCopyText :value="justIssuedSecret" size="sm" masked />
        </template>
      </UAlert>

      <USeparator />

      <div class="space-y-3">
        <h2 class="text-lg font-semibold">登録済みクライアント</h2>

        <UCollapsible v-for="client in clients" :key="client.client_id"
          class="overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-700">
          <template #default="{ open }">
            <div class="w-full flex items-center justify-between p-4 cursor-pointer select-none">
              <div class="flex items-center gap-3 overflow-hidden">
                <div
                  class="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 group-hover:text-primary transition-colors">
                  <UIcon
                    :name="client.token_endpoint_auth_method === 'none' ? 'i-lucide-smartphone' : 'i-lucide-server'"
                    class="text-xl" />
                </div>
                <div class="flex flex-col min-w-0 text-left">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-lg font-bold truncate text-neutral-900 dark:text-white min-w-0">
                      {{ client.client_name || '(名称未設定)' }}
                    </span>
                    <UBadge v-if="client.token_endpoint_auth_method === 'none'" size="xs" color="info" variant="subtle"
                      class="flex-shrink-0">
                      Public</UBadge>
                    <UBadge v-else size="xs" color="neutral" variant="subtle" class="flex-shrink-0">Confidential
                    </UBadge>
                  </div>
                  <span class="text-xs text-neutral-400 font-mono truncate">{{ client.client_id }}</span>
                </div>
              </div>
              <UIcon name="i-lucide-chevron-down" class="transition-transform duration-300 text-neutral-400"
                :class="[open && 'rotate-180']" />
            </div>
          </template>

          <template #content>
            <div class="px-4 pb-4 pt-2 space-y-6 border-t border-neutral-100 dark:border-neutral-800">
              <div class="gap-6 mt-2">
                <div class="space-y-4">
                  <AppCopyText :value="client.client_id" label="CLIENT ID" color="neutral" size="sm" />

                  <UFormField label="クライアント名" size="sm">
                    <UInput class="w-full max-w-md" v-model="client.editable_name" block />
                  </UFormField>

                  <UFormField label="リダイレクトURI" size="sm">
                    <UInput class="w-full max-w-md mb-6" v-model="client.editable_redirect_uri" block />
                  </UFormField>
                </div>

                <div class="space-y-4">
                  <UFormField label="許可スコープ" size="sm">
                    <UInputMenu :model-value="parseScopes(client.editable_scope_text)" multiple create-item
                      :items="scopeItems" size="sm" block @create="onCreateScopeItem"
                      @update:model-value="value => updateClientScopes(client, value)" />
                  </UFormField>

                  <div
                    class="flex items-center justify-between w-fit gap-4 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-100 dark:border-neutral-800">
                    <div class="flex flex-col">
                      <span class="text-sm font-medium">PKCE 必須</span>
                      <span class="text-xs text-neutral-500">
                        {{ client.token_endpoint_auth_method === 'none' ? 'Public Clientは必須です' : '推奨設定' }}
                      </span>
                    </div>
                    <USwitch v-model="client.editable_require_pkce"
                      :disabled="client.token_endpoint_auth_method === 'none'" size="sm" />
                  </div>
                </div>
              </div>

              <div
                class="text-[11px] text-neutral-500 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg space-y-1 border border-neutral-100 dark:border-neutral-800">
                <div>
                  <span class="font-bold w-20">Redirect URIs: </span>
                  <span class="truncate">{{ (client.redirect_uris || []).join(', ') || '-' }}</span>
                </div>
                <div>
                  <span class="font-bold w-20">Scopes: </span>
                  <span class="truncate">{{ client.scope || '-' }}</span>
                </div>
              </div>

              <div
                class="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <UButton color="error" icon="i-lucide-trash-2" variant="ghost" size="sm" label="削除" :loading="loading"
                  @click="onDeleteClient(client.client_id)" />

                <div class="flex flex-wrap gap-2">
                  <UButton v-if="client.token_endpoint_auth_method !== 'none'" color="neutral"
                    icon="i-lucide-refresh-cw" variant="outline" size="sm" label="再発行" :loading="loading"
                    @click="onRotateSecret(client.client_id)" />
                  <UButton color="primary" icon="i-lucide-save" size="sm" label="変更を保存" :loading="loading"
                    @click="onUpdateClient(client)" />
                </div>
              </div>
            </div>
          </template>
        </UCollapsible>

        <p v-if="!loading && clients.length === 0" class="text-sm text-neutral-500">
          クライアントはまだ登録されていません。
        </p>
      </div>
    </div>
  </AppBackgroundCard>

  <TheConfirmModal />
</template>
