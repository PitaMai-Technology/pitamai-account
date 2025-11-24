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
    (inviteState.organizationId === undefined ||
      inviteState.organizationId === null) &&
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

const selectedOrganizationName = computed(() => {
  if (!inviteState.organizationId || !organizations.value.data) return '';
  const org = organizations.value.data.find(
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
  try {
    if (!inviteState.organizationId) {
      toast.add({
        title: 'エラー',
        description: '組織が選択されていません。',
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
    <UPageCard class="mx-auto space-y-6">
      <div>
        <h2 class="text-xl font-semibold mb-1">メンバーを招待</h2>
        <p class="text-sm text-gray-600"
          >メールアドレスを指定して組織に招待します。</p
        >
      </div>

      <UForm
        :schema="InviteMemberForm"
        :state="inviteState"
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
        @submit="onInviteSubmit"
      >
        <UFormField label="Organization" name="organizationId">
          <div>
            <template
              v-if="organizations.isPending"
              class="flex items-center gap-2"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="h-4 w-4 animate-spin text-primary"
              />
              <span class="text-sm text-gray-500">読み込み中...</span>
            </template>

            <div
              v-else-if="!organizations.data || organizations.data.length === 0"
              class="text-sm text-gray-500"
            >
              所属している組織がありません
            </div>

            <template v-else>
              <USelect
                v-model="inviteState.organizationId"
                :items="
                  organizations.data.map(org => ({
                    label: `${org.name} (${org.slug})`,
                    value: org.id,
                  }))
                "
                placeholder="-- 組織を選択 --"
                clearable
                class="w-full"
              />
              <span
                v-if="selectedOrganizationName"
                class="text-xs text-gray-500"
                >選択中: {{ selectedOrganizationName }}</span
              >
            </template>
          </div>
        </UFormField>

        <UFormField label="メールアドレス" name="email" required>
          <UInput
            v-model="inviteState.email"
            type="email"
            placeholder="example@gmail.com"
            autocomplete="email"
            class="w-full"
          />
        </UFormField>

        <UFormField label="ロール" name="role" required>
          <USelect
            v-model="inviteState.role"
            :items="roleOptions.map(r => ({ label: r.label, value: r.value }))"
            class="w-full"
          />
        </UFormField>

        <UFormField label="再送信" name="resend" class="md:col-span-2">
          <UCheckbox
            v-model="inviteState.resend"
            label="再送信 (既に招待済みの場合)"
          />
        </UFormField>

        <div class="md:col-span-2 flex gap-2 justify-end">
          <UButton
            type="submit"
            color="primary"
            :loading="inviteLoading"
            :disabled="inviteLoading || !inviteState.organizationId"
          >
            {{ inviteLoading ? '送信中...' : '招待を送信' }}
          </UButton>
          <UButton
            variant="ghost"
            :disabled="inviteLoading"
            @click="resetInviteForm"
            >リセット</UButton
          >
        </div>
      </UForm>
    </UPageCard>
  </div>
</template>
