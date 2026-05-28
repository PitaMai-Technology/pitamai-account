/**
 * Discord Incoming Webhook ユーティリティ
 *
 * 環境変数 DISCORD_WEBHOOK_URL にWebhookのURLを設定してください。
 * URLが設定されていない場合は何もせず正常終了します。
 */

import { logger } from '~~/server/utils/logger';

interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  embeds?: DiscordEmbed[];
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

export async function sendDiscordWebhook(payload: DiscordWebhookPayload): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.warn('[discord-webhook] DISCORD_WEBHOOK_URL が設定されていません。スキップします。');
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, text }, '[discord-webhook] 送信に失敗しました');
    }
  } catch (err) {
    // Webhookの失敗はメインの処理に影響させない
    logger.error({ err }, '[discord-webhook] 送信中にエラーが発生しました');
  }
}
