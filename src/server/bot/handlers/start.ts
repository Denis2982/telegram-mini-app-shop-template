import { InlineKeyboard, type Bot } from "grammy";
import { getConfig } from "../../config";
import { trDefault } from "../../locale";
import { upsertUser } from "../../auth";

export function registerStart(bot: Bot) {
  bot.command("start", async (ctx) => {
    const cfg = getConfig();
    const from = ctx.from;
    if (from) await upsertUser({ id: from.id, first_name: from.first_name, last_name: from.last_name, username: from.username, language_code: from.language_code });
    const kb = new InlineKeyboard();
    if (cfg.miniAppUrl.startsWith("https://")) kb.webApp(trDefault("bot.openShop"), cfg.miniAppUrl).row();
    kb.text(trDefault("bot.rules"), "info:rules");
    if (cfg.supportUsername) kb.url(trDefault("bot.support"), `https://t.me/${cfg.supportUsername}`);
    else kb.text(trDefault("bot.support"), "info:support");
    await ctx.reply(trDefault("bot.welcome", { store: cfg.storeName }), { reply_markup: kb });
  });

  bot.callbackQuery(/^info:(rules|support)$/, async (ctx) => {
    const kind = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.reply(trDefault(kind === "rules" ? "bot.rulesText" : "bot.supportText"), { parse_mode: "HTML" });
  });

  // helper for configuring ADMIN_CHAT_ID
  bot.command("chatid", async (ctx) => {
    await ctx.reply(trDefault("bot.chatId", { id: ctx.chat.id }), { parse_mode: "HTML" });
  });
}
