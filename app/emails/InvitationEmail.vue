<script setup lang="ts">

const props = defineProps<{
  inviterEmail: string
  organizationName: string
  inviteLink: string
}>();
</script>

<template>
  <EHtml lang="ja">
    <EHead />
    <ESubject>【ピタマイ・テクノロジー】組織への招待</ESubject>

    <EBody>
      <EPreview>PitaMaiアカウントにおける「{{ props.organizationName }}」への招待のお知らせです。</EPreview>
      <ESection>
        <EContainer style="padding: 40px 24px; background: #f9fafb;">
          <EContainer
            style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;">
            <EHeading>組織への招待</EHeading>

            <EText>
              <strong>{{ props.inviterEmail }}</strong> さんから、組織 <strong>「{{ props.organizationName }}」</strong>
              のメンバーとして招待されました。
            </EText>

            <EText>以下の招待リンクをクリックして、招待の受け入れとログインを行ってください。</EText>

            <EText>
              URL：<ELink :href="props.inviteLink">{{ props.inviteLink }}</ELink>
            </EText>

            <EHr />

            <EmailSign />
          </EContainer>
        </EContainer>
      </ESection>
    </EBody>
  </EHtml>
</template>
