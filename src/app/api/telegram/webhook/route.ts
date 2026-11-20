import { webhookCallback } from "grammy";
import { getBot } from "@/server/bot/bot";
import { getConfig } from "@/server/config";
import { fail } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const bot = getBot();
  if (!bot) return fail("Bot is not configured", 503);
  if (!bot.isInited()) await bot.init();
  const handler = webhookCallback(bot, "std/http", { secretToken: getConfig().webhookSecret });
  return handler(req);
}
