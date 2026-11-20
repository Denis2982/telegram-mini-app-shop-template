import { getBot } from "@/server/bot/bot";
import { getConfig } from "@/server/config";
import { fail, json, withAdmin } from "@/server/http";
import { trDefault } from "@/server/locale";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => {
  const bot = getBot();
  if (!bot) return fail("BOT_TOKEN is not set", 503);
  return json(await bot.api.getWebhookInfo());
});

/** Registers the webhook, commands and the Mini App menu button. */
export const POST = withAdmin(async () => {
  const bot = getBot();
  const cfg = getConfig();
  if (!bot) return fail("BOT_TOKEN is not set", 503);
  if (!cfg.miniAppUrl) return fail("TELEGRAM_MINI_APP_URL is not set", 400);
  const url = `${cfg.miniAppUrl}/api/telegram/webhook`;
  await bot.api.setWebhook(url, {
    secret_token: cfg.webhookSecret,
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
  });
  await bot.api.setMyCommands([
    { command: "start", description: "Start" },
    { command: "my_orders", description: "My orders" },
  ]);
  if (cfg.miniAppUrl.startsWith("https://")) {
    await bot.api.setChatMenuButton({
      menu_button: { type: "web_app", text: trDefault("bot.openShop").replace(/^\S+\s/, ""), web_app: { url: cfg.miniAppUrl } },
    });
  }
  return json({ ok: true, webhook: url });
});
