<script setup lang="ts">
/**
 * MailComposeModal.vue
 * 
 * 役割:
 * メール作成フォームをモーダルダイアログで提供します。
 * 宛先（To/Cc/Bcc）の動的フィールド追加削除、件名・本文・添付ファイル入力、
 * 送信/下書き保存を実現します。
 * 
 * Props:
 * - composeOpen: モーダルの表示状態
 * - recipientType: 現在の宛先種別（'to'/'cc'/'bcc'）
 * - recipientTypeOptions: 宛先種別セレクトのオプション配列
 * - composeState: メール入力フォーム全体の状態オブジェクト
 *   { to, ccList[], bccList[], subject, text, files[] }
 * - draftSaving: 下書き保存中フラグ（ボタン loading 状態制御用）
 * - sending: 送信中フラグ（ボタン loading 状態制御用）
 * 
 * Emits:
 * - update:composeOpen: モーダル閉じる/開く時に親へ状態通知
 * - update:recipientType: 宛先種別セレクト切り替え時に親へ通知
 * - addCcField / addBccField: Cc/Bcc 行追加ボタンクリック時
 * - removeCcField / removeBccField: Cc/Bcc 行削除ボタンクリック時（index 指定）
 * - saveDraft: 下書き保存ボタンクリック時
 * - sendMail: 送信ボタンクリック時
 */
import type { ComposeRecipientType, ComposeState } from '~/stores/mail';

const props = defineProps<{
  composeOpen: boolean;
  recipientType: ComposeRecipientType;
  recipientTypeOptions: Array<{ label: string; value: string }>;
  composeState: ComposeState;
  draftSaving: boolean;
  sending: boolean;
}>();

const emit = defineEmits<{
  'update:composeOpen': [value: boolean];
  'update:recipientType': [value: ComposeRecipientType];
  addCcField: [];
  removeCcField: [index: number];
  addBccField: [];
  removeBccField: [index: number];
  saveDraft: [];
  sendMail: [];
}>();

const composeOpenModel = computed({
  get: () => props.composeOpen,
  set: value => emit('update:composeOpen', value),
});

const recipientTypeModel = computed({
  get: () => props.recipientType,
  set: value => emit('update:recipientType', value),
});
</script>

<template>
  <UModal v-model:open="composeOpenModel" title="新規メール作成" class="max-w-5xl">
    <template #body>
      <div class="space-y-3">
        <UFormField label="宛先種別">
          <USelect v-model="recipientTypeModel" :items="recipientTypeOptions" class="w-40" />
        </UFormField>

        <UFormField v-if="recipientTypeModel === 'to'" label="To" required>
          <UInput v-model="composeState.to" placeholder="to@example.com" />
        </UFormField>

        <UFormField v-if="recipientTypeModel === 'cc'" label="Cc" required>
          <div class="space-y-2">
            <div v-for="(cc, index) in composeState.ccList" :key="`cc-${index}`" class="flex items-center gap-2">
              <UInput v-model="composeState.ccList[index]" placeholder="cc@example.com" class="w-full" />
              <UButton color="neutral" variant="outline" size="xs" @click="emit('addCcField')">
                +
              </UButton>
              <UButton color="error" variant="outline" size="xs" @click="emit('removeCcField', index)">
                -
              </UButton>
            </div>
          </div>
        </UFormField>

        <UFormField v-if="recipientTypeModel === 'bcc'" label="Bcc" required>
          <div class="space-y-2">
            <div v-for="(bcc, index) in composeState.bccList" :key="`bcc-${index}`" class="flex items-center gap-2">
              <UInput v-model="composeState.bccList[index]" placeholder="bcc@example.com" class="w-full" />
              <UButton color="neutral" variant="outline" size="xs" @click="emit('addBccField')">
                +
              </UButton>
              <UButton color="error" variant="outline" size="xs" @click="emit('removeBccField', index)">
                -
              </UButton>
            </div>
          </div>
        </UFormField>
        <UFormField label="件名" required>
          <UInput v-model="composeState.subject" placeholder="件名" />
        </UFormField>
        <UFormField label="本文">
          <UTextarea class="w-full" v-model="composeState.text" :rows="10" />
        </UFormField>
        <UFormField label="添付ファイル">
          <UFileUpload v-model="composeState.files" multiple />
          <p class="mt-1 text-xs text-gray-500" v-if="composeState.files.length">
            {{ composeState.files.length }} 件選択中
          </p>
        </UFormField>

        <UPageCard title="高度な設定" :collapsible="true" :default-open="false">
          <UCheckbox v-model="composeState.sign" label="PGP署名して送信" />
          <p class="text-xs text-gray-500">署名するには設定ページで GPG 鍵ペアを作成してください。</p>
          <UCheckbox v-model="composeState.encrypt" label="受信者公開鍵で暗号化して送信" />
          <p class="text-xs text-gray-500">暗号化するには、"宛先ユーザー"の公開鍵が外部システム( keys.openpgp.org )に登録されている必要があります。</p>
        </UPageCard>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="composeOpenModel = false">キャンセル</UButton>
        <UButton color="neutral" variant="outline" :loading="draftSaving" @click="emit('saveDraft')">下書き保存</UButton>
        <UButton color="primary" :loading="sending" @click="emit('sendMail')">送信</UButton>
      </div>
    </template>
  </UModal>
</template>
