<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

definePageMeta({
  layout: 'the-app',
});

const sessionRef = authClient.useSession();

const organizations = authClient.useListOrganizations();
</script>

<template>
  <div>
    <div>
      <AppBackgroundCard>
        <!-- ユーザー情報 -->
        <div v-if="sessionRef.data" class="space-y-4">
          <!-- 組織リンク -->
          <div class="rounded-lg bg-white p-6 shadow">
            <h2 class="mb-4 text-lg font-semibold">所属組織</h2>
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
          </div>

          <div class="rounded-lg bg-white p-6 shadow">
            <h2 class="mb-4 text-lg font-semibold">ユーザー情報</h2>
            <div class="space-y-2">
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-mail" class="text-gray-400" />
                <span class="font-medium">メール:</span>
                <span class="text-gray-600">{{
                  sessionRef.data.user.email
                  }}</span>
              </div>
              <div v-if="sessionRef.data.user.name" class="flex items-center space-x-2">
                <UIcon name="i-lucide-user" class="text-gray-400" />
                <span class="font-medium">名前:</span>
                <span class="text-gray-600">{{
                  sessionRef.data.user.name
                  }}</span>
              </div>
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-calendar" class="text-gray-400" />
                <span class="font-medium">登録日:</span>
                <span class="text-gray-600">
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
          </div>
        </div>

        <div v-else class="py-12 text-center text-gray-500">
          {{ sessionRef.data ? sessionRef.data : '読み込み中です。' }}
        </div>
      </AppBackgroundCard>
    </div>
  </div>
</template>
