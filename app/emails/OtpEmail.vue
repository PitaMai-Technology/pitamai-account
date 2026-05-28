<script setup lang="ts">

const props = defineProps<{
  otp: string
  purpose: string // 'ログイン', 'メール検証', 'パスワード設定' など
}>();

const title = computed(() => {
  if (props.purpose === 'ログイン') {
    return 'ログイン認証コード - PitaMai'
  } else if (props.purpose === 'メール検証') {
    return 'メール検証コード - PitaMai'
  } else if (props.purpose === 'パスワード設定') {
    return 'パスワード設定コード - PitaMai'
  }
  return '認証コード - PitaMai'
})
</script>

<template>
  <EHtml lang="ja">
    <EHead />
    <ESubject>{{ title }}</ESubject>

    <EBody>
      <EPreview>【PitaMaiアカウント】ワンタイム認証コード（OTP）</EPreview>
      <ESection>
        <EContainer style="padding: 40px 24px; background: #f9fafb;">
          <EContainer
            style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;">
            <EHeading>{{ props.purpose }}認証コード</EHeading>

            <EText>PitaMaiアカウントでの{{ props.purpose }}要求に伴い、認証コードを発行しました。</EText>
            <EText>以下の認証コードを画面に入力してください。</EText>

            <!-- 認証コードを強調表示 -->
            <EContainer
              style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1f2937;">
                {{ props.otp }}
              </span>
            </EContainer>

            <EText style="color: #6b7280; font-size: 14px;">※このコードは5分間のみ有効です。</EText>

            <EHr />

            <EmailSign />
          </EContainer>
        </EContainer>
      </ESection>
    </EBody>
  </EHtml>
</template>
