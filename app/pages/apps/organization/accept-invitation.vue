<script setup lang="ts">
import { authClient } from '~/composable/auth-client'
import { useConfirmDialog } from '~/composable/useConfirmDialog'
const toast = useToast()

definePageMeta({
  layout: 'the-app',
})

const route = useRoute()
const router = useRouter()
const invitationId = computed(() => route.query.invitationId as string | undefined)
const loading = ref(false)
const message = ref('')
const { open: confirmOpen, confirm: confirmDialog, resolve: resolveConfirm } = useConfirmDialog();

/**
* 組織への招待を承認する関数
*/
async function acceptInvitation() {
  const confirmed = await confirmDialog();
  if (!confirmed) {
    loading.value = false;
    return;
  }

  if (!invitationId.value) {
    message.value = 'エラー: 招待IDが見つかりません。'
    toast.add({ title: 'エラー', description: message.value, color: 'error' })
    console.log('acceptInvitation: no invitationId', route.query)
    return
  }

  loading.value = true
  message.value = '招待を承認中です...'
  console.log('acceptInvitation: start', invitationId.value)

  try {
    const { error } = await authClient.organization.acceptInvitation({
      invitationId: invitationId.value,
    })

    if (error) {
      message.value = `承認に失敗しました: ${error.message}`
      console.error('acceptInvitation error:', error)
      toast.add({
        title: '承認に失敗しました',
        description: message.value,
        color: 'error',
      })
    } else {
      message.value = '招待を承認し、組織に参加しました！'
      toast.add({
        title: '招待を承認しました',
        description: '組織に参加しました。ダッシュボードに移動します。',
        color: 'success',
      })

      await router.push('/apps/dashboard')
    }
  } catch (err) {
    message.value = `予期せぬエラー: ${err instanceof Error ? err.message : '不明なエラー'}`
    console.error('acceptInvitation unexpected error:', err)
    toast.add({ title: 'エラー', description: message.value, color: 'error' })
  } finally {
    loading.value = false
  }
}

// コンポーネントがマウントされたらすぐに承認処理を開始する例
// もしボタンクリックで承認する場合は、この行を削除してください
// onMounted(() => {
//   acceptInvitation()
// })
</script>

<template>
  <div class="invitation-acceptance">
    <h1>組織への招待</h1>
    <p v-if="loading">{{ message }}</p>
    <p v-else-if="message && message.includes('失敗')">{{ message }}</p>
    <div v-else-if="!loading && !message.includes('成功')">
      <p>以下の招待を承認しますか？</p>
      <UButton @click="acceptInvitation" :disabled="loading">
        招待を承認する
      </UButton>

      <ConfirmModal :open="confirmOpen" title="確認" message="本当に招待を承認しますか？" @confirm="() => resolveConfirm(true)"
        @cancel="() => resolveConfirm(false)" />
    </div>
  </div>
</template>