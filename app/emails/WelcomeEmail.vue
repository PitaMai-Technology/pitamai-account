<script setup lang="ts">
import EmalSign from './components/EmalSign.vue'

const props = defineProps<{
  name?: string
  loginUrl?: string
}>();
</script>

<template>
  <EHtml lang="ja">
    <EHead />
    <ESubject>【ピタマイ・テクノロジー】構成員への申請承認のお知らせ</ESubject>

    <EBody>
      <EPreview>{{ props.name }} さん、ピタマイ・テクノロジーへの構成員申請が承認されました。</EPreview>
      <ESection>
        <EContainer style="padding: 40px 24px; background: #f9fafb;">
          <EContainer
            style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;">
            <EHeading>構成員申請承認のお知らせ</EHeading>

            <EText>{{ props.name }} さん</EText>

            <EText>ピタマイ・テクノロジーへの構成員申請が承認されました。</EText>

            <EText>以下のログインページより、構成員管理システムにログインしてください。</EText>

            <EText>
              URL：<ELink :href="props.loginUrl">{{ props.loginUrl }}</ELink>
            </EText>

            <EHr />

            <EmalSign />
          </EContainer>
        </EContainer>
      </ESection>
    </EBody>
  </EHtml>
</template>