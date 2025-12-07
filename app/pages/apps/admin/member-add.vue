<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import { useActiveOrg } from '~/composable/useActiveOrg';
import type { z } from 'zod';
import { useConfirmDialog } from '~/composable/useConfirmDialog';
const {
  open: confirmOpen,
  message: confirmMessage,
  confirm: confirmDialog,
  resolve: resolveConfirm,
  registerPageLeaveGuard,
} = useConfirmDialog();

// ページ離脱ガードを有効化（離脱時専用メッセージ）
registerPageLeaveGuard('このページから離脱すると、入力中の内容は失われます。よろしいですか？');

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const activeOrganization = useActiveOrg();
// 管理者以上 (admin, owner) のみをサーバー側でフィルタした組織一覧を取得
const { data: adminOrganizations, status: adminOrganizationsStatus } = await useFetch(
  '/api/pitamai/admin-list',
  {
    key: '/api/pitamai/admin-list',
  }
);

// shared/types/member-add.ts から自動インポートされる
type InviteSchema = z.infer<typeof InviteMemberForm>;

const inviteState = reactive<Partial<InviteSchema>>({
  email: '',
  role: 'member',
  organizationId: undefined,
  resend: false,
});

const inviteLoading = ref(false);

// activeOrganization がロードされたら inviteState.organizationId を補完する
watchEffect(() => {
  if (
    (inviteState.organizationId === undefined ||
      inviteState.organizationId === null) &&
    (activeOrganization.value?.data || adminOrganizations.value)
  ) {
    const activeId = activeOrganization.value?.data?.id;
    // 優先: activeOrganization が adminOrganizations に含まれていれば選択
    if (activeId && adminOrganizations.value?.some(org => org.id === activeId)) {
      inviteState.organizationId = activeId;
      return;
    }
    // それ以外は adminOrganizations の先頭を選択
    const firstAdminOrgId = adminOrganizations.value?.[0]?.id;
    if (firstAdminOrgId) inviteState.organizationId = firstAdminOrgId;
  }
});

const roleOptions = [
  { label: 'メンバー', value: 'member' },
  { label: '管理者', value: 'admins' },
  { label: 'オーナー', value: 'owner' },
];

const selectedOrganizationName = computed(() => {
  if (!inviteState.organizationId || !adminOrganizations.value) return '';
  const org = adminOrganizations.value.find(
    item => item.id === inviteState.organizationId
  );
  return org ? `${org.name} (${org.slug})` : '';
});

async function onInviteSubmit(event?: FormSubmitEvent<InviteSchema>) {
  event?.preventDefault?.();
  if (inviteLoading.value) return;

  const parsed = InviteMemberForm.safeParse(inviteState);
  if (!parsed.success) {
    toast.add({
      title: '入力エラー',
      description:
        '入力値が不正です。メールアドレスとロールを確認してください。',
      color: 'error',
    });
    return;
  }

  inviteLoading.value = true;

  const confirmed = await confirmDialog('本当に組織へ招待しますか？');
  if (!confirmed) {
    inviteLoading.value = false;
    return;
  }
  try {
    if (!inviteState.organizationId) {
      toast.add({
        title: 'エラー',
        description: '組織が選択されていません。',
        color: 'error',
      });
      return;
    }

    const { error } = await authClient.organization.inviteMember({
      email: inviteState.email!,
      role: inviteState.role!,
      organizationId: inviteState.organizationId,
      resend: inviteState.resend,
    });

    if (error) {
      console.error('Client: inviteMember SDK error:', error);
      toast.add({
        title: 'エラー',
        description: `招待の送信に失敗しました: ${error.message}`,
        color: 'error',
      });
      return;
    }

    toast.add({
      title: '成功',
      description: `${inviteState.email} に招待を送信しました。`,
      color: 'success',
    });

    // フォームをリセット
    inviteState.email = '';
    inviteState.role = 'member';
    inviteState.resend = false;
  } catch (error: unknown) {
    console.error('Client: inviteMember unexpected error:', error);
    if (error instanceof Error) {
      toast.add({
        title: 'エラー',
        description: error.message,
        color: 'error',
      });
    } else {
      toast.add({
        title: 'エラー',
        description: 'メンバー招待中に予期しないエラーが発生しました',
        color: 'error',
      });
    }
  } finally {
    inviteLoading.value = false;
  }
}

function resetInviteForm() {
  inviteState.email = '';
  inviteState.role = 'member';
  // 既定の組織は、まず activeOrganization が adminOrganizations に含まれるか確認し、
  // 含まれなければ adminOrganizations の最初の組織を選択する
  const activeId = activeOrganization.value?.data?.id;
  if (activeId && adminOrganizations.value?.some(org => org.id === activeId)) {
    inviteState.organizationId = activeId;
  } else if (adminOrganizations.value && adminOrganizations.value.length > 0) {
    const firstAdminOrgId = adminOrganizations.value?.[0]?.id;
    inviteState.organizationId = firstAdminOrgId;
  } else {
    inviteState.organizationId = undefined;
  }
  inviteState.resend = false;
}
</script>

<template>
  <div class="mt-6">
    <UPageCard class="mx-auto space-y-6">
      <div>
        <h2 class="text-xl font-semibold mb-1">メンバーを招待</h2>
        <p class="text-sm text-gray-600">メールアドレスを指定して組織に招待します。</p>
      </div>

      <UForm :schema="InviteMemberForm" :state="inviteState" class="grid grid-cols-1 md:grid-cols-2 gap-4"
        @submit="onInviteSubmit">
        <UFormField label="Organization" name="organizationId">
          <div>
            <template v-if="adminOrganizationsStatus === 'pending'">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin text-primary" />
                <span class="text-sm text-gray-500">読み込み中...</span>
              </div>
            </template>

            <div v-else-if="!adminOrganizations || adminOrganizations.length === 0" class="text-sm text-gray-500">
              所属している組織がありません
            </div>

            <template v-else>
              <USelect v-model="inviteState.organizationId" :items="adminOrganizations.map(org => ({
                label: `${org.name} (${org.slug})`,
                value: org.id,
              }))
                " placeholder="-- 組織を選択 --" clearable class="w-full" />
              <span v-if="selectedOrganizationName" class="text-xs text-gray-500">選択中: {{ selectedOrganizationName
                }}</span>
            </template>
          </div>
        </UFormField>

        <UFormField label="メールアドレス" name="email" required>
          <UInput v-model="inviteState.email" type="email" placeholder="example@gmail.com" autocomplete="email"
            class="w-full" />
        </UFormField>

        <UFormField label="ロール" name="role" required>
          <USelect v-model="inviteState.role" :items="roleOptions.map(r => ({ label: r.label, value: r.value }))"
            class="w-full" />
        </UFormField>

        <UFormField label="再送信" name="resend" class="md:col-span-2">
          <UCheckbox v-model="inviteState.resend" label="再送信 (既に招待済みの場合)" />
        </UFormField>

        <div class="md:col-span-2 flex gap-2 justify-end">
          <UButton type="submit" color="primary" :loading="inviteLoading"
            :disabled="inviteLoading || !inviteState.organizationId">
            招待を送信
          </UButton>
          <UButton variant="ghost" :disabled="inviteLoading" @click="resetInviteForm">リセット</UButton>
        </div>
      </UForm>
    </UPageCard>
    <LazyTheConfirmModal :open="confirmOpen" title="確認" :message="confirmMessage" @confirm="() => resolveConfirm(true)"
      @cancel="() => resolveConfirm(false)" />
  </div>
</template>
