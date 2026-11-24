import { Bot } from "grammy";
import { getConfig } from "../config";
import { registerAdmin } from "./handlers/admin";
import { registerOrders } from "./handlers/orders";
import { registerPayments } from "./handlers/payments";
import { registerStart } from "./handlers/start";
import { tr } from "../locale";

let bot: Bot | null = null;
let botToken = "";

/** Returns the singleton grammY Bot (or null when BOT_TOKEN is not configured). */
export function getBot(): Bot | null {
  const token = getConfig().botToken;
  if (!token) return null;
  if (!bot || botToken !== token) {
    const b = new Bot(token);
    // logging middleware
    b.use(async (ctx, next) => {
      const started = Date.now();
      await next();
      console.log(`[bot] update ${ctx.update.update_id} handled in ${Date.now() - started}ms`);
    });
    b.catch((err) => console.error("[bot] error", err.error));
    registerStart(b);
    registerOrders(b);
    registerAdmin(b);
    registerPayments(b);

    // Быстрый переход в админку по команде /admin
    b.command("admin", async (ctx) => {
      const cfg = getConfig();
      if (!ctx.from || !cfg.adminIds.includes(ctx.from.id)) {
        return ctx.reply(tr(ctx.from?.language_code, "bot.adminNoAccess"));
      }

      const adminUrl = `${cfg.miniAppUrl}/admin`;
      await ctx.reply(`${tr(ctx.from?.language_code, "bot.adminPanelTitle")}\n\n${tr(ctx.from?.language_code, "bot.adminPanelHint")}`, {
        reply_markup: {
          inline_keyboard: [[{ text: tr(ctx.from?.language_code, "bot.adminPanelButton"), url: adminUrl }]],
        },
      });
    });

    bot = b;
    botToken = token;
  }
  return bot;
}
