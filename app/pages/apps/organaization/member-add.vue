<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { authClient } from '~/composable/auth-client';
import type { z } from 'zod';

definePageMeta({
  layout: 'the-app',
});

const toast = useToast();
const activeOrganization = authClient.useActiveOrganization();
const organizations = authClient.useListOrganizations();

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
    (inviteState.organizationId === undefined || inviteState.organizationId === null) &&
    activeOrganization.value?.data
  ) {
    inviteState.organizationId = activeOrganization.value.data.id;
  }
});

const roleOptions = [
  { label: 'メンバー', value: 'member' },
  { label: '管理者', value: 'admin' },
  { label: 'オーナー', value: 'owner' },
];

async function onInviteSubmit(event?: FormSubmitEvent<InviteSchema>) {
  event?.preventDefault?.();
  if (inviteLoading.value) return;

  const parsed = InviteMemberForm.safeParse(inviteState);
  if (!parsed.success) {
    toast.add({
      title: '入力エラー',
      description: '入力値が不正です。メールアドレスとロールを確認してください。',
      color: 'error',
    });
    return;
  }

  inviteLoading.value = true;
  try {
    if (!inviteState.organizationId) {
      toast.add({
        title: 'エラー',
        description: 'Organization が選択されていません。',
        color: 'error',
      });
      return;
    }

    const { data, error } = await authClient.organization.inviteMember({
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

    console.debug('Client: inviteMember response data:', data);

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
  inviteState.organizationId = activeOrganization.value?.data?.id;
  inviteState.resend = false;
}
</script>

<template>
  <div class="mt-6">
    <h2 class="text-xl font-semibold mb-4">メンバーを招待</h2>

    <form class="grid grid-cols-1 md:grid-cols-2 gap-4" @submit.prevent="onInviteSubmit()">
      <div>
        <label class="block text-sm mb-1">Organization</label>
        <div v-if="organizations.isPending" class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin text-primary" />
          <span class="text-sm text-gray-500">読み込み中...</span>
        </div>
        <div v-else-if="!organizations.data || organizations.data.length === 0" class="text-sm text-gray-500">
          所属している組織がありません
        </div>
        <select v-else v-model="inviteState.organizationId" class="w-full input" required>
          <option value="">-- 組織を選択 --</option>
          <option v-for="org in organizations.data" :key="org.id" :value="org.id">
            {{ org.name }} ({{ org.slug }})
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">メールアドレス <span class="text-red-500">*</span></label>
        <input v-model="inviteState.email" type="email" class="w-full input" placeholder="example@gmail.com" required>
      </div>

      <div>
        <label class="block text-sm mb-1">ロール <span class="text-red-500">*</span></label>
        <select v-model="inviteState.role" class="w-full input" required>
          <option v-for="role in roleOptions" :key="role.value" :value="role.value">
            {{ role.label }}
          </option>
        </select>
      </div>

      <div class="flex items-center md:col-span-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="inviteState.resend" type="checkbox" class="checkbox">
          <span class="text-sm">再送信 (既に招待済みの場合)</span>
        </label>
      </div>

      <div class="md:col-span-2 flex gap-2 justify-end items-end">
        <button type="submit" class="btn btn-primary" :disabled="inviteLoading || !inviteState.organizationId">
          {{ inviteLoading ? '送信中...' : '招待を送信' }}
        </button>
        <button type="button" class="btn" :disabled="inviteLoading" @click="resetInviteForm">
          リセット
        </button>
      </div>
    </form>
  </div>
</template>
