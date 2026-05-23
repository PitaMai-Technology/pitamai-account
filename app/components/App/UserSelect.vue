<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

const model = defineModel<string | undefined>({ required: true });

const props = withDefaults(
  defineProps<{
    placeholder?: string;
  }>(),
  {
    placeholder: 'ユーザーを選択してください',
  }
);

interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
}

const users = ref<UserItem[]>([]);
const loading = ref(false);

const selectItems = computed(() => {
  return users.value.map(user => ({
    label: user.email ? `${user.name || '名前なし'} (${user.email})` : user.id,
    value: user.id,
  }));
});

async function fetchUsers() {
  loading.value = true;
  try {
    const { data, error } = await authClient.admin.listUsers({
      query: {
        limit: 100, // 余裕を持って取得
      },
    });
    if (error) {
      console.error('Failed to list users', error);
      return;
    }
    if (data?.users) {
      users.value = data.users.map(u => ({
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
      }));
    }
  } catch (err) {
    console.error('Unexpected error listing users', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <USelectMenu v-model="model" value-key="value" :items="selectItems" :placeholder="props.placeholder"
    :loading="loading" class="w-full max-w-lg" :search-input="{
      placeholder: '名前やメールアドレスで検索...',
      icon: 'i-lucide-search'
    }" />
</template>
