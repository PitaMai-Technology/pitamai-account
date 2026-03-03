import type { Ref } from 'vue';
import type { ComposeRecipientType } from '~/stores/mail';

type UseRecipientTypeSwitchParams = {
  recipientType: Ref<ComposeRecipientType>;
  hasRecipientData: (type: ComposeRecipientType) => boolean;
  clearRecipientField: (type: ComposeRecipientType) => void;
  confirm: (message: string) => Promise<boolean>;
};

export function useRecipientTypeSwitch(params: UseRecipientTypeSwitchParams) {
  const recipientTypeLabel: Record<ComposeRecipientType, string> = {
    to: 'To',
    cc: 'CC',
    bcc: 'BCC',
  };

  async function handleRecipientTypeChange(newType: ComposeRecipientType) {
    const currentType = params.recipientType.value;

    if (currentType === newType) {
      return;
    }

    if (params.hasRecipientData(currentType)) {
      const currentLabel = recipientTypeLabel[currentType];
      const newLabel = recipientTypeLabel[newType];
      const message = `${currentLabel}から${newLabel}に切り替えますか？\n既存の${currentLabel}の宛先に記入したものは破棄されます`;

      const confirmed = await params.confirm(message);

      if (!confirmed) {
        return;
      }

      params.clearRecipientField(currentType);
    }

    params.recipientType.value = newType;
  }

  return {
    handleRecipientTypeChange,
  };
}
