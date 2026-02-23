<script setup lang="ts">
/**
 * MailDetailPanel.vue
 * 
 * 役割:
 * メール詳細表示パネル。選択中のメール件名・送信者・Cc・本文・添付ファイルを表示し、
 * 既読/未読切り替え、アーカイブ、削除、下書き復元（下書きフォルダ時）、
 * 復元（ゴミ箱フォルダ時）などの操作ボタンを提供します。
 * 
 * Props:
 * - selectedMessage: 一覧で現在選択中のメール（件名・UID）
 * - currentMail: 詳細表示中のメール全文（HTML/テキスト・添付ファイル）
 * - messageMetaLabel: メタ情報ラベル（'差出人(From)' または '宛先(To)'）
 * - messageMetaValue: メタ情報値（送信者アドレスまたは宛先）
 * - isSentFolder: 送信済みフォルダかどうかの真偽値
 * - messageCcValue: Cc ヘッダー値（送信済みフォルダ時のみ表示）
 * - hasSelectedMail: メールが選択されているかの真偽値（操作ボタン disable 制御用）
 * - selectedSeen: 現在メール既読状態（ボタン「既読/未読」テキスト切り替え用）
 * - isDraftFolder: 下書きフォルダかどうか（ボタン条件表示用）
 * - isTrashFolder: ゴミ箱フォルダかどうか（ボタン条件表示用）
 * 
 * Emits:
 * - toggleSeen: 既読/未読切り替えボタン
 * - move: 削除/アーカイブ/復元ボタン（destination='trash'|'archive'|'inbox'）
 * - useDraftCompose: 下書きから送信ボタン
 */
type MailListItem = {
  uid: number;
  subject: string | null;
};

type MailDetail = {
  subject: string | null;
  from: string | null;
  html: string | null;
  text: string | null;
  pgpDetachedSignature: string | null;
  pgpDetachedSignedDataBase64: string | null;
  attachments: Array<{
    filename: string | null;
    contentType: string;
    size: number;
  }>;
  isGpgSigned: boolean;
};

const props = defineProps<{
  selectedMessage: MailListItem | null;
  currentMail: MailDetail | null;
  messageMetaLabel: string;
  messageMetaValue: string;
  isSentFolder: boolean;
  messageCcValue: string | null;
  hasSelectedMail: boolean;
  selectedSeen: boolean | null;
  isDraftFolder: boolean;
  isTrashFolder: boolean;
  isSpamFolder: boolean;
}>();

const emit = defineEmits<{
  toggleSeen: [];
  move: [destination: 'trash' | 'archive' | 'inbox'];
  useDraftCompose: [];
  openAttachment: [index: number];
}>();

// GPG 署名検証
type GpgStatus = 'none' | 'checking' | 'valid' | 'invalid' | 'unknown';
const gpgStatus = ref<GpgStatus>('none');
const gpgDetail = ref<string>('');

type GpgDecryptStatus = 'none' | 'checking' | 'ok' | 'failed';
const gpgDecryptStatus = ref<GpgDecryptStatus>('none');
const gpgDecryptDetail = ref('');
const decryptedText = ref<string | null>(null);

const displayText = computed(() => decryptedText.value ?? props.currentMail?.text ?? null);

const visibleAttachments = computed(() => {
  const attachments = props.currentMail?.attachments ?? [];
  return attachments.filter(item => {
    const contentType = (item.contentType ?? '').toLowerCase();
    const filename = (item.filename ?? '').toLowerCase();

    const isPgpSignature =
      contentType.includes('application/pgp-signature') ||
      filename === 'signature.asc' ||
      filename.endsWith('.sig');
    const isPgpPublicKey =
      contentType.includes('application/pgp-keys') ||
      contentType.includes('pgp-public-key') ||
      filename.endsWith('.asc') ||
      filename.endsWith('.pgp');

    return !(isPgpSignature || isPgpPublicKey);
  });
});

watch(
  () => props.currentMail,
  async mail => {
    decryptedText.value = null;
    gpgDecryptStatus.value = 'none';
    gpgDecryptDetail.value = '';

    if (!mail?.text) {
      return;
    }

    if (!mail.text.includes('-----BEGIN PGP MESSAGE-----')) {
      return;
    }

    gpgDecryptStatus.value = 'checking';

    try {
      const result = await $fetch<
        | { decrypted: true; text: string }
        | { decrypted: false; reason: string; text: string }
      >('/api/pitamai/mail/gpg-decrypt', {
        method: 'POST',
        body: {
          text: mail.text,
        },
      });

      if (result.decrypted) {
        decryptedText.value = result.text;
        gpgDecryptStatus.value = 'ok';
        gpgDecryptDetail.value = '秘密鍵で復号済み';
      } else {
        gpgDecryptStatus.value = 'failed';
        gpgDecryptDetail.value = result.reason;
      }
    } catch {
      gpgDecryptStatus.value = 'failed';
      gpgDecryptDetail.value = '復号中にエラーが発生しました';
    }
  },
  { immediate: true }
);

watch(
  () => props.currentMail,
  async mail => {
    if (!mail || !mail.isGpgSigned) {
      gpgStatus.value = 'none';
      gpgDetail.value = '';
      return;
    }

    gpgStatus.value = 'checking';

    const hasInlineSignedText =
      typeof mail.text === 'string' &&
      mail.text.includes('-----BEGIN PGP SIGNED MESSAGE-----');
    const hasDetachedSignature =
      typeof mail.pgpDetachedSignature === 'string' &&
      mail.pgpDetachedSignature.includes('-----BEGIN PGP SIGNATURE-----');

    if (!hasInlineSignedText && !hasDetachedSignature) {
      gpgStatus.value = 'unknown';
      gpgDetail.value = '署名データを抽出できないため検証できません';
      return;
    }

    try {
      const senderEmail = mail.from?.match(/<(.+?)>/)?.[1] ?? mail.from ?? '';
      if (!senderEmail || !senderEmail.includes('@')) {
        gpgStatus.value = 'unknown';
        gpgDetail.value = '送信者メールアドレスを特定できないため検証できません';
        return;
      }

      const result = await $fetch<
        | { verified: true; fingerprint: string; signerEmail: string | null }
        | { verified: false; reason: string }
      >('/api/pitamai/mail/gpg-verify', {
        method: 'POST',
        body: {
          text: mail.text ?? '',
          senderEmail,
          useOwnKey: props.isSentFolder,
          detachedSignature: mail.pgpDetachedSignature ?? undefined,
          detachedSignedDataBase64: mail.pgpDetachedSignedDataBase64 ?? undefined,
        },
      });

      if (result.verified) {
        gpgStatus.value = 'valid';
        gpgDetail.value = `フィンガープリント: ${result.fingerprint}`;
      } else {
        gpgStatus.value = 'invalid';
        gpgDetail.value = result.reason;
      }
    } catch {
      gpgStatus.value = 'unknown';
      gpgDetail.value = '署名検証中にエラーが発生しました';
    }
  },
  { immediate: true }
);
</script>

<template>
  <UCard class="lg:col-span-7">
    <template #header>
      <div class="flex gap-2 mb-2">
        <UButton size="xs" color="neutral" variant="outline" :disabled="!hasSelectedMail" @click="emit('toggleSeen')">
          {{ selectedSeen ? '未読にする' : '既読にする' }}
        </UButton>
        <UButton size="xs" color="neutral" variant="outline" :disabled="!hasSelectedMail"
          @click="emit('move', 'archive')">
          アーカイブ
        </UButton>
        <UButton size="xs" color="error" variant="outline" :disabled="!hasSelectedMail" @click="emit('move', 'trash')">
          削除
        </UButton>
        <UButton v-if="isDraftFolder" size="xs" color="primary" variant="outline" :disabled="!hasSelectedMail"
          @click="emit('useDraftCompose')">
          下書きから送信
        </UButton>
        <UButton v-if="isTrashFolder" size="xs" color="success" variant="outline" :disabled="!hasSelectedMail"
          @click="emit('move', 'inbox')">
          戻す
        </UButton>
      </div>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="truncate text-sm font-semibold">
            {{ selectedMessage?.subject || currentMail?.subject || '(件名なし)' }}
          </h2>
          <p class="text-xs text-gray-600">{{ messageMetaLabel }}: {{ messageMetaValue }}</p>
          <p v-if="isSentFolder" class="text-xs text-gray-600">Cc: {{ messageCcValue }}</p>
        </div>
      </div>
      <!-- GPG 署名バッジ -->
      <div v-if="gpgStatus !== 'none'" class="mt-2">
        <span v-if="gpgStatus === 'checking'" class="inline-flex items-center gap-1 text-xs text-gray-500">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" /> 署名を検証中...
        </span>
        <UTooltip v-else-if="gpgStatus === 'valid'" :text="gpgDetail">
          <span
            class="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
            <UIcon name="i-lucide-shield-check" /> PGP署名 有効
          </span>
        </UTooltip>
        <UTooltip v-else-if="gpgStatus === 'invalid'" :text="gpgDetail">
          <span
            class="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200">
            <UIcon name="i-lucide-shield-x" /> PGP署名 無効
          </span>
        </UTooltip>
        <UTooltip v-else-if="gpgStatus === 'unknown'" :text="gpgDetail">
          <span
            class="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            <UIcon name="i-lucide-shield-question" /> PGP署名 未確認
          </span>
        </UTooltip>
      </div>

      <div v-if="gpgDecryptStatus !== 'none'" class="mt-2">
        <span v-if="gpgDecryptStatus === 'checking'" class="inline-flex items-center gap-1 text-xs text-gray-500">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" /> 本文を復号中...
        </span>
        <UTooltip v-else-if="gpgDecryptStatus === 'ok'" :text="gpgDecryptDetail">
          <span
            class="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
            <UIcon name="i-lucide-lock-open" /> PGP復号済み
          </span>
        </UTooltip>
        <UTooltip v-else-if="gpgDecryptStatus === 'failed'" :text="gpgDecryptDetail">
          <span
            class="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            <UIcon name="i-lucide-lock" /> PGP復号失敗
          </span>
        </UTooltip>
      </div>
    </template>

    <div v-if="visibleAttachments.length" class="mb-4 space-y-1 rounded border border-gray-200 p-3">
      <p class="text-xs font-medium text-gray-700">添付ファイル</p>
      <div v-for="(attachment, index) in visibleAttachments" :key="`${attachment.filename}-${attachment.size}`"
        class="flex items-center justify-between gap-3 text-xs text-gray-600">
        <p>
          {{ attachment.filename || 'unnamed' }} ({{ attachment.size }} bytes)
        </p>
        <UButton size="xs" color="neutral" variant="outline" :disabled="isSpamFolder"
          @click="emit('openAttachment', index)">
          開く
        </UButton>
      </div>
      <p v-if="isSpamFolder" class="text-xs text-amber-700">
        迷惑メールでは添付ファイルを開けません。
      </p>
    </div>

    <AppMailBody :html="currentMail?.html" :text="displayText" :block-media="isSpamFolder" />
  </UCard>
</template>
