// server/utils/email.ts
import nodemailer from 'nodemailer';

const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  logger: true,
  debug: process.env.NODE_ENV === 'development',
});

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from = process.env.SMTP_FROM || 'noreply@example.com',
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}) {
  try {
    await transporter.sendMail({ from, to, subject, text, html });
    console.log(`✅ Email sent successfully to ${to}`);
  } catch (error) {
    console.error('❌ Failed to send email:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      to,
      smtpConfig: {
        host: process.env.SMTP_HOST,
        port: smtpPort,
        user: process.env.SMTP_USER,
      },
    });
    throw new Error('Failed to send email');
  }
}
