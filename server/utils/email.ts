import { Resend, type CreateEmailOptions } from 'resend';

type SendEmailParams = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from = process.env.RESEND_FROM ?? 'PitaMaiアカウント <onboarding@resend.dev>',
}: SendEmailParams) {
  const config = useRuntimeConfig();
  const resendApiKey = config.RESEND_API_KEY || process.env.RESEND_API_KEY;
  const resendDisabled =
    String(config.RESEND_DISABLED || process.env.RESEND_DISABLED) === 'true';
  const sender = from || config.RESEND_FROM || process.env.RESEND_FROM;

  if (resendDisabled) {
    console.log(`⚠️ Email sending is disabled. Skip sending to ${to}`);
    return;
  }

  if (!resendApiKey) {
    console.error('❌ RESEND_API_KEY is not configured');
    throw new Error('Failed to send email: RESEND_API_KEY is not configured');
  }

  if (!sender) {
    console.error('❌ RESEND_FROM is not configured');
    throw new Error('Failed to send email: RESEND_FROM is not configured');
  }

  const resend = new Resend(resendApiKey);

  const finalHtml = html || (text ? text.replace(/\n/g, '<br>') : undefined);

  if (!finalHtml) {
    throw new Error('Either html or text must be provided to send an email');
  }

  try {
    const payload: CreateEmailOptions = {
      from: sender,
      to,
      subject,
      html: finalHtml,
      text,
    };

    const response = await resend.emails.send(payload);

    if (response.error) {
      console.error('❌ Failed to send email:', {
        error: response.error.message,
        name: response.error.name,
        to,
        from: sender,
      });
      throw new Error(`Failed to send email: ${response.error.message}`);
    }

    console.log(`✅ Email sent successfully to ${to}`);
  } catch (error) {
    console.error('❌ Failed to send email:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      to,
      resendConfig: {
        hasApiKey: Boolean(resendApiKey),
        from: sender,
        disabled: resendDisabled,
      },
    });
    throw error instanceof Error ? error : new Error('Failed to send email');
  }
}
