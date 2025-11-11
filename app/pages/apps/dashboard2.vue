<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

// セッション情報を取得
const sessionRef = await authClient.useSession(useFetch);
const session = computed(() => sessionRef.data.value);
// const isPending = computed(() => sessionRef.isPending);

</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <div class="container mx-auto p-4">
      <UPageCard class="mx-auto max-w-4xl">
        <!-- ヘッダー -->
        <div class="mb-6 flex items-center justify-between border-b pb-4">
          <div>
            <h1 class="text-2xl font-bold">ダッシュボード</h1>
            <p class="text-gray-500">PitaMAIへようこそ</p>
          </div>
          <UButton icon="i-lucide-log-out" :loading="loading" @click="signOut">
            ログアウト
          </UButton>
        </div>

        <!-- ローディング状態 -->
        <!-- <div v-if="isPending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-primary" />
        </div> -->

        <!-- ユーザー情報 -->
        <div v-if="session" class="space-y-4">
          <div class="rounded-lg bg-white p-6 shadow">
            <h2 class="mb-4 text-lg font-semibold">ユーザー情報</h2>
            <div class="space-y-2">
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-mail" class="text-gray-400" />
                <span class="font-medium">メール:</span>
                <span class="text-gray-600">{{ session.user.email }}</span>
              </div>
              <div v-if="session.user.name" class="flex items-center space-x-2">
                <UIcon name="i-lucide-user" class="text-gray-400" />
                <span class="font-medium">名前:</span>
                <span class="text-gray-600">{{ session.user.name }}</span>
              </div>
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-calendar" class="text-gray-400" />
                <span class="font-medium">登録日:</span>
                <span class="text-gray-600">{{
                  new Date(session.user.createdAt).toLocaleDateString('ja-JP')
                }}</span>
              </div>
            </div>
          </div>

          <!-- セッション情報 -->
          <div class="rounded-lg bg-white p-6 shadow">
            <h2 class="mb-4 text-lg font-semibold">セッション情報</h2>
            <div class="space-y-2">
              <div class="flex items-center space-x-2">
                <UIcon name="i-lucide-shield-check" class="text-green-500" />
                <span class="text-green-600">認証済み</span>
              </div>
              <div v-if="session.session.expiresAt" class="flex items-center space-x-2">
                <UIcon name="i-lucide-clock" class="text-gray-400" />
                <span class="font-medium">有効期限:</span>
                <span class="text-gray-600">{{
                  new Date(session.session.expiresAt).toLocaleDateString(
                    'ja-JP'
                  )
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
