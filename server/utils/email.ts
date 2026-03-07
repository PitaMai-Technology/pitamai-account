// server/utils/email.ts
import nodemailer from 'nodemailer';

const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpConnectionTimeout = parseInt(
  process.env.SMTP_CONNECTION_TIMEOUT || '10000'
);
const smtpGreetingTimeout = parseInt(
  process.env.SMTP_GREETING_TIMEOUT || '10000'
);
const smtpSocketTimeout = parseInt(process.env.SMTP_SOCKET_TIMEOUT || '20000');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: !smtpSecure,
  connectionTimeout: smtpConnectionTimeout,
  greetingTimeout: smtpGreetingTimeout,
  socketTimeout: smtpSocketTimeout,
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
  from = process.env.SMTP_FROM ?? 'PitaMaiアカウント',
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
        secure: smtpSecure,
        user: process.env.SMTP_USER,
        connectionTimeout: smtpConnectionTimeout,
        greetingTimeout: smtpGreetingTimeout,
        socketTimeout: smtpSocketTimeout,
      },
    });
    throw new Error('Failed to send email');
  }
}
