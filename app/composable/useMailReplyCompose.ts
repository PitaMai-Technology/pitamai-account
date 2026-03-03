import type { Ref } from 'vue';
import type { ComposeState, MailDetail } from '~/stores/mail';

type UseMailReplyComposeParams = {
  currentMail: Ref<MailDetail | null>;
  selectedUid: Ref<number | null>;
  composeState: ComposeState;
  composeOpen: Ref<boolean>;
  resetComposeState: () => void;
};

export function useMailReplyCompose(params: UseMailReplyComposeParams) {
  const toast = useToast();

  function extractReplyToAddress(fromValue: string | null) {
    if (!fromValue) return '';

    const match = fromValue.match(/<([^>]+)>/);
    if (match?.[1]) {
      return match[1].trim();
    }

    return fromValue.trim();
  }

  function buildReplySubject(subject: string | null) {
    const baseSubject = (subject ?? '').trim();
    if (!baseSubject) return 'Re:';
    if (/^re\s*:/i.test(baseSubject)) return baseSubject;
    return `Re: ${baseSubject}`;
  }

  function buildReplyBody(text: string | null) {
    const sourceText = (text ?? '').trim();
    if (!sourceText) return '';

    const quoted = sourceText
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');

    return `\n\n${quoted}`;
  }

  function onReplyCompose() {
    const activeDetail = params.currentMail.value;

    if (!activeDetail || activeDetail.uid !== params.selectedUid.value) {
      toast.add({
        title: 'エラー',
        description: '返信対象メールの読み込みが完了していません',
        color: 'error',
      });
      return;
    }

    const replyTo = extractReplyToAddress(activeDetail.from);
    if (!replyTo) {
      toast.add({
        title: 'エラー',
        description: '返信先アドレスを特定できませんでした',
        color: 'error',
      });
      return;
    }

    params.resetComposeState();
    params.composeState.to = replyTo;
    params.composeState.subject = buildReplySubject(activeDetail.subject);
    params.composeState.text = buildReplyBody(activeDetail.text);
    params.composeOpen.value = true;
  }

  return {
    onReplyCompose,
  };
}
