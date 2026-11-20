import type { Bot } from "grammy";
import { getConfig } from "../../config";
import { tr } from "../../locale";
import { applyAction, type OrderAction } from "../../services/order.service";

const ACTIONS = ["pay", "processing", "shipped", "completed", "cancel"];

export function registerAdmin(bot: Bot) {
  bot.callbackQuery(/^ord:(\d+):(\w+)$/, async (ctx) => {
    const cfg = getConfig();
    const lang = ctx.from.language_code;
    const inAdminChat = String(ctx.chat?.id ?? "") === cfg.adminChatId;
    if (!inAdminChat && !cfg.adminIds.includes(ctx.from.id)) {
      return void (await ctx.answerCallbackQuery({ text: tr(lang, "bot.notAllowed"), show_alert: true }));
    }
    const id = Number(ctx.match[1]);
    const action = ctx.match[2];
    if (!ACTIONS.includes(action)) return void (await ctx.answerCallbackQuery());

    const res = await applyAction(id, action as OrderAction);
    if ("error" in res) {
      await ctx.answerCallbackQuery({ text: String(res.error), show_alert: true });
    } else {
      await ctx.answerCallbackQuery({ text: tr(lang, "bot.done") });
      // Receipt photo messages have no text card – update their keyboard directly.
      if (ctx.callbackQuery.message && "photo" in ctx.callbackQuery.message) {
        const { adminKeyboard } = await import("../notify");
        await ctx.editMessageReplyMarkup({ reply_markup: adminKeyboard(res.order) }).catch(() => undefined);
      }
    }
  });
}
