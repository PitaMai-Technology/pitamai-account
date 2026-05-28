<script setup lang="ts">

const props = defineProps<{
  resetLink: string
}>();
</script>

<template>
  <EHtml lang="ja">
    <EHead />
    <ESubject>【PitaMaiアカウント】パスワード再設定</ESubject>

    <EBody>
      <EPreview>PitaMaiのパスワード再設定手続きのご案内です。</EPreview>
      <ESection>
        <EContainer style="padding: 40px 24px; background: #f9fafb;">
          <EContainer
            style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;">
            <EHeading>パスワード再設定</EHeading>

            <EText>PitaMaiアカウントのパスワード再設定のリクエストを受け付けました。</EText>

            <EText>以下のリンクをクリックして、パスワードの再設定を完了させてください。</EText>

            <EText>
              URL：<ELink :href="props.resetLink">{{ props.resetLink }}</ELink>
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
