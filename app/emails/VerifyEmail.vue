<script setup lang="ts">

const props = defineProps<{
  verificationUrl: string
}>();
</script>

<template>
  <EHtml lang="ja">
    <EHead />
    <ESubject>【PitaMaiアカウント】メールアドレス検証のお願い</ESubject>

    <EBody>
      <EPreview>PitaMaiアカウントのメールアドレス検証のご案内です。</EPreview>
      <ESection>
        <EContainer style="padding: 40px 24px; background: #f9fafb;">
          <EContainer
            style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;">
            <EHeading>メールアドレスの検証</EHeading>

            <EText>メールアドレス変更手続きを完了するため、以下のリンクをクリックしてメールアドレスの検証を行ってください。</EText>

            <EText>
              URL：<ELink :href="props.verificationUrl">{{ props.verificationUrl }}</ELink>
            </EText>

            <EText style="color: #6b7280; font-size: 14px;">※このリンクには有効期限があります。</EText>

            <EHr />

            <EmailSign />
          </EContainer>
        </EContainer>
      </ESection>
    </EBody>
  </EHtml>
</template>
