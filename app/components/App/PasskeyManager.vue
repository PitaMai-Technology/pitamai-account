<script setup lang="ts">
import type { Passkey } from '@better-auth/passkey';
import { authClient } from '~/composable/auth-client';
import { captureClientError } from '~/utils/capture-client-error';

/**
 * ログイン済みユーザー本人のパスキーを管理する。
 *
 * Better Auth の各APIがセッションと所有者を確認するため、ここでは独自APIを作らない。
 * 追加・一覧・改名・削除は、すべて Better Auth のクライアントを直接呼べる。
 * 独自の server/api へ中継すると認可処理が二重になるため、この画面では作らない。
 *
 * @example
 * ```ts
 * await authClient.passkey.addPasskey({ name: '仕事用PC' })
 * await authClient.passkey.listUserPasskeys()
 * await authClient.passkey.updatePasskey({ id: passkeyId, name: 'スマートフォン' })
 * await authClient.passkey.deletePasskey({ id: passkeyId })
 * ```
 */

const toast = useToast();
const confirmStore = useConfirmDialogStore();
const passkeys = ref<Passkey[]>([]);
const newPasskeyName = ref('');
const editingNames = reactive<Record<string, string>>({});
const listLoading = ref(false);
const addLoading = ref(false);
const savingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const passkeySupported = ref(false);
const passkeyAddModalOpen = ref(false);

// Passkey 1.6.10には公式の表示名ヘルパーがまだないため、代表的な認証器だけ補完する。
// AAGUIDが不明・非公開の場合は推測せず、最終的に「パスキー」と表示する。
const authenticatorNames: Record<string, string> = {
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'Apple Passwords',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  'cb69481e-8ff7-4039-93ec-0a2729a1ef67': 'YubiKey 5 Series',
};

function getPasskeyName(passkey: Passkey) {
  const registeredName = passkey.name?.trim();
  if (registeredName) return registeredName;

  if (passkey.aaguid) {
    const authenticatorName = authenticatorNames[passkey.aaguid.toLowerCase()];
    if (authenticatorName) return authenticatorName;
  }

  return 'パスキー';
}

function formatCreatedAt(createdAt: Date | string | undefined) {
  if (!createdAt) return '登録日時不明';

  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '登録日時不明';

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

async function loadPasskeys() {
  listLoading.value = true;
  try {
    const { data, error } = await authClient.passkey.listUserPasskeys();
    if (error) {
      captureClientError(error, 'passkey.list');
      toast.add({
        title: 'パスキーを取得できませんでした',
        description: '時間をおいて、もう一度お試しください。',
        color: 'error',
      });
      return;
    }

    passkeys.value = data ?? [];
    for (const passkey of passkeys.value) {
      editingNames[passkey.id] = passkey.name ?? '';
    }
  } catch (error) {
    captureClientError(error, 'passkey.list');
    toast.add({
      title: 'パスキーを取得できませんでした',
      description: '時間をおいて、もう一度お試しください。',
      color: 'error',
    });
  } finally {
    listLoading.value = false;
  }
}

async function addPasskey() {
  if (!passkeySupported.value || addLoading.value) return;

  addLoading.value = true;
  try {
    const name = newPasskeyName.value.trim();
    const { error } = await authClient.passkey.addPasskey(
      name ? { name } : undefined
    );

    if (error) {
      const cancelled = getErrorCode(error) === 'REGISTRATION_CANCELLED';
      if (!cancelled) {
        captureClientError(error, 'passkey.add');
      }
      toast.add({
        title: cancelled
          ? 'パスキー登録を中止しました'
          : 'パスキーを追加できませんでした',
        description: cancelled
          ? '登録する場合は、もう一度追加ボタンを押してください。'
          : 'パスキーを追加できませんでした。時間をおいて、もう一度お試しください。',
        color: cancelled ? 'warning' : 'error',
      });
      return;
    }

    newPasskeyName.value = '';
    await loadPasskeys();
    passkeyAddModalOpen.value = false;
    toast.add({ title: 'パスキーを追加しました', color: 'success' });
  } catch (error) {
    const cancelled =
      error instanceof DOMException && error.name === 'NotAllowedError';
    if (!cancelled) {
      captureClientError(error, 'passkey.add');
    }
    toast.add({
      title: cancelled
        ? 'パスキー登録を中止しました'
        : 'パスキーを追加できませんでした',
      description: cancelled
        ? '登録する場合は、もう一度追加ボタンを押してください。'
        : 'パスキーを追加できませんでした。時間をおいて、もう一度お試しください。',
      color: cancelled ? 'warning' : 'error',
    });
  } finally {
    addLoading.value = false;
  }
}

async function updatePasskey(passkey: Passkey) {
  if (savingId.value) return;

  savingId.value = passkey.id;
  try {
    const name = editingNames[passkey.id]?.trim() ?? '';
    const { error } = await authClient.passkey.updatePasskey({
      id: passkey.id,
      name,
    });

    if (error) {
      captureClientError(error, 'passkey.update');
      toast.add({
        title: 'パスキー名を変更できませんでした',
        description: '時間をおいて、もう一度お試しください。',
        color: 'error',
      });
      return;
    }

    await loadPasskeys();
    toast.add({ title: 'パスキー名を変更しました', color: 'success' });
  } catch (error) {
    captureClientError(error, 'passkey.update');
    toast.add({
      title: 'パスキー名を変更できませんでした',
      description: '時間をおいて、もう一度お試しください。',
      color: 'error',
    });
  } finally {
    savingId.value = null;
  }
}

async function deletePasskey(passkey: Passkey) {
  // Email OTP が復旧手段として残るため、最後の1件も削除できる。
  // 誤操作だけは避けたいので、削除件数によらず既存の確認ダイアログを通す。
  const confirmed = await confirmStore.confirm(
    `「${getPasskeyName(passkey)}」を削除します。よろしいですか？`,
    'パスキーの削除'
  );
  if (!confirmed || deletingId.value) return;

  deletingId.value = passkey.id;
  try {
    const { error } = await authClient.passkey.deletePasskey({
      id: passkey.id,
    });
    if (error) {
      captureClientError(error, 'passkey.delete');
      toast.add({
        title: 'パスキーを削除できませんでした',
        description: '時間をおいて、もう一度お試しください。',
        color: 'error',
      });
      return;
    }

    await loadPasskeys();
    toast.add({ title: 'パスキーを削除しました', color: 'success' });
  } catch (error) {
    captureClientError(error, 'passkey.delete');
    toast.add({
      title: 'パスキーを削除できませんでした',
      description: '時間をおいて、もう一度お試しください。',
      color: 'error',
    });
  } finally {
    deletingId.value = null;
  }
}

onMounted(() => {
  passkeySupported.value = 'PublicKeyCredential' in window;
  void loadPasskeys();
});
</script>

<template>
  <section class="space-y-5" aria-labelledby="passkey-heading">
    <div>
      <h2 id="passkey-heading" class="font-semibold">パスキー</h2>
      <p class="mt-1 text-sm text-muted">
        端末の生体認証、PIN、またはセキュリティキーを使ってログインできます。
        Email OTPは予備のログイン方法として引き続き利用できます。
      </p>
    </div>

    <UAlert
      v-if="!passkeySupported"
      color="warning"
      variant="soft"
      title="このブラウザーではパスキーを追加できません"
      description="登録済みパスキーの名前変更や削除はできます。追加にはWebAuthn対応ブラウザーを使用してください。"
    />

    <!--
      一覧画面には開始ボタンだけを置き、名前入力はモーダルへまとめる。
      v-model:open を使うと、右上の閉じるボタンや Esc キーでも状態が同期される。
    -->
    <UModal
      v-model:open="passkeyAddModalOpen"
      title="パスキーを追加"
      description="このアカウントで使うパスキーに、分かりやすい名前を付けられます。"
      :ui="{ footer: 'justify-end' }"
    >
      <UButton
        color="primary"
        icon="i-lucide-plus"
        :disabled="!passkeySupported || listLoading"
      >
        パスキーを追加
      </UButton>

      <template #body>
        <!--
          form 属性でフッターの追加ボタンと関連付けている。
          入力欄で Enter を押した場合も、同じ addPasskey() が呼ばれる。
        -->
        <form id="passkey-add-form" @submit.prevent="addPasskey">
          <UFormField
            label="パスキー名（任意）"
            description="例: 仕事用PC、スマートフォン"
          >
            <UInput
              v-model="newPasskeyName"
              maxlength="100"
              placeholder="未入力でも登録できます"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          :disabled="addLoading"
          @click="passkeyAddModalOpen = false"
        >
          キャンセル
        </UButton>
        <UButton
          type="submit"
          form="passkey-add-form"
          color="primary"
          :loading="addLoading"
          :disabled="!passkeySupported"
        >
          追加
        </UButton>
      </template>
    </UModal>

    <div
      v-if="listLoading"
      class="flex items-center gap-2 py-4 text-sm text-muted"
    >
      <UIcon name="i-lucide-loader-circle" class="animate-spin" />
      パスキーを読み込んでいます
    </div>

    <UAlert
      v-else-if="passkeys.length === 0"
      color="neutral"
      variant="soft"
      title="登録済みのパスキーはありません"
      description="上のボタンから、このアカウントで使うパスキーを追加できます。"
    />

    <ul v-else class="divide-y divide-muted rounded-md border border-muted">
      <li v-for="passkey in passkeys" :key="passkey.id" class="space-y-3 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="truncate font-medium">{{ getPasskeyName(passkey) }}</p>
            <p class="mt-1 text-xs text-muted">
              {{ formatCreatedAt(passkey.createdAt) }}
              <span v-if="passkey.backedUp">・同期対応</span>
            </p>
          </div>
          <UIcon
            name="i-lucide-key-round"
            class="mt-1 size-5 shrink-0 text-muted"
          />
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="editingNames[passkey.id]"
            maxlength="100"
            aria-label="パスキー名"
            placeholder="パスキー名"
            class="flex-1"
          />
          <div class="flex gap-2">
            <UButton
              variant="outline"
              icon="i-lucide-save"
              :loading="savingId === passkey.id"
              :disabled="Boolean(savingId || deletingId)"
              @click="updatePasskey(passkey)"
            >
              名前を保存
            </UButton>
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :loading="deletingId === passkey.id"
              :disabled="Boolean(savingId || deletingId)"
              @click="deletePasskey(passkey)"
            >
              削除
            </UButton>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
