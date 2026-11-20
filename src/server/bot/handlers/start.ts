import { InlineKeyboard, type Bot } from "grammy";
import { getConfig, pickLocale } from "../../config";
import { tr } from "../../locale";
import { upsertUser } from "../../auth";

export function registerStart(bot: Bot) {
  bot.command("start", async (ctx) => {
    const cfg = getConfig();
    const from = ctx.from;
    if (from) await upsertUser({ id: from.id, first_name: from.first_name, last_name: from.last_name, username: from.username, language_code: from.language_code });
    const lang = pickLocale(from?.language_code);
    const kb = new InlineKeyboard();
    if (cfg.miniAppUrl.startsWith("https://")) kb.webApp(tr(lang, "bot.openShop"), cfg.miniAppUrl).row();
    kb.text(tr(lang, "bot.rules"), "info:rules");
    if (cfg.supportUsername) kb.url(tr(lang, "bot.support"), `https://t.me/${cfg.supportUsername}`);
    else kb.text(tr(lang, "bot.support"), "info:support");
    await ctx.reply(tr(lang, "bot.welcome", { store: cfg.storeName }), { reply_markup: kb });
  });

  bot.callbackQuery(/^info:(rules|support)$/, async (ctx) => {
    const lang = pickLocale(ctx.from.language_code);
    const kind = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.reply(tr(lang, kind === "rules" ? "bot.rulesText" : "bot.supportText"), { parse_mode: "HTML" });
  });

  // helper for configuring ADMIN_CHAT_ID
  bot.command("chatid", async (ctx) => {
    await ctx.reply(tr(ctx.from?.language_code, "bot.chatId", { id: ctx.chat.id }), { parse_mode: "HTML" });
  });
}
