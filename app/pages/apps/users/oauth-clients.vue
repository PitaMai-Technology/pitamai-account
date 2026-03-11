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

  const confirmed = await confirmStore.confirm(
    'このOAuthクライアントを削除します。よろしいですか？',
    'OAuthクライアント削除'
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

  if (!z.url().safeParse(client.editable_redirect_uri).success) {
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
        <p class="text-sm text-neutral-500 mt-1">
          OIDC連携用クライアントを作成・管理します。
        </p>
      </div>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onCreateClient">
        <UFormField label="クライアント名" name="clientName" required>
          <UInput v-model="state.clientName" placeholder="example-web-client" />
        </UFormField>

        <UFormField label="リダイレクトURI" name="redirectUri" required>
          <UInput v-model="state.redirectUri" placeholder="https://client.example.com/callback" />
        </UFormField>

        <UFormField label="許可スコープ" name="scopesText" required>
          <UInputMenu class="w-md max-w-md" v-model="createScopesModel" multiple create-item :items="scopeItems"
            @create="onCreateScopeItem" />
        </UFormField>

        <UCheckbox v-model="state.isPublicClient" label="Public Client (client_secretなし)" />
        <UCheckbox v-model="state.requirePkce" :disabled="state.isPublicClient" label="PKCE 必須（推奨）" />
        <p class="text-xs text-neutral-500">
          Confidential Client は PKCE を任意で選択できます。Public Client は常に PKCE 必須です。
        </p>
        <UButton type="submit" :loading="loading">クライアント作成</UButton>
      </UForm>

      <UAlert v-if="justIssuedSecret" color="warning" variant="soft" title="client_secret はこの表示時のみ確認できます"
        :description="justIssuedSecret" />

      <USeparator />

      <div class="space-y-3">
        <h2 class="text-lg font-semibold">登録済みクライアント</h2>

        <div v-for="client in clients" :key="client.client_id" class="rounded border border-neutral-200 p-4 space-y-2">
          <p class="font-medium">{{ client.client_name || '(名称未設定)' }}</p>
          <p class="text-xs break-all text-neutral-500">client_id: {{ client.client_id }}</p>
          <p class="text-xs text-neutral-500">
            auth_method: {{ client.token_endpoint_auth_method || '-' }}
          </p>
          <UFormField label="クライアント名" size="sm">
            <UInput v-model="client.editable_name" />
          </UFormField>
          <UFormField label="リダイレクトURI" size="sm">
            <UInput v-model="client.editable_redirect_uri" />
          </UFormField>
          <UFormField label="許可スコープ" size="sm">
            <UInputMenu class="w-md max-w-md" :model-value="parseScopes(client.editable_scope_text)" multiple
              create-item :items="scopeItems" size="sm" @create="onCreateScopeItem"
              @update:model-value="value => updateClientScopes(client, value)" />
          </UFormField>
          <UCheckbox v-model="client.editable_require_pkce" :disabled="client.token_endpoint_auth_method === 'none'"
            label="PKCE 必須" />
          <p class="text-xs text-neutral-500">
            {{ client.token_endpoint_auth_method === 'none'
              ? 'Public Client は PKCE 必須です。'
              : 'Confidential Client は PKCE を任意で選択できます。' }}
          </p>
          <p class="text-xs text-neutral-500">
            redirect_uris: {{ (client.redirect_uris || []).join(', ') || '-' }}
          </p>
          <p class="text-xs text-neutral-500">
            scope: {{ client.scope || '-' }}
          </p>

          <div class="flex gap-2">
            <UButton color="primary" variant="outline" size="xs" :loading="loading" @click="onUpdateClient(client)">
              更新
            </UButton>
            <UButton color="neutral" variant="outline" size="xs" :loading="loading"
              @click="onRotateSecret(client.client_id)">
              シークレット再発行
            </UButton>
            <UButton color="error" variant="outline" size="xs" :loading="loading"
              @click="onDeleteClient(client.client_id)">
              削除
            </UButton>
          </div>
        </div>

        <p v-if="!loading && clients.length === 0" class="text-sm text-neutral-500">
          クライアントはまだ登録されていません。
        </p>
      </div>
    </div>
  </AppBackgroundCard>

  <TheConfirmModal />
</template>
