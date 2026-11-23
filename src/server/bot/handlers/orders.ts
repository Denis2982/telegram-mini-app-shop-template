import type { Bot } from "grammy";
import { formatMoney, pickLocale } from "../../config";
import { tr } from "../../locale";
import { getUserByTgId } from "../../auth";
import { listUserOrders } from "../../services/order.service";
import { getEffectiveConfig } from "../../services/store-settings.service";
import { adminChat, adminKeyboard, esc } from "../notify";
import { attachReceipt, findPendingManualOrder, getOrderFull } from "../../services/order.service";

export function registerOrders(bot: Bot) {
  bot.command("my_orders", async (ctx) => {
    const lang = pickLocale(ctx.from?.language_code);
    const user = ctx.from ? await getUserByTgId(ctx.from.id) : null;
    const list = user ? await listUserOrders(user.id, 10) : [];
    if (!list.length) return void (await ctx.reply(tr(lang, "bot.myOrdersEmpty")));
    const cfg = await getEffectiveConfig();
    const lines = list.map(
      (o) =>
        `<b>№${o.id}</b> · ${esc(tr(lang, `status.${o.status}`))} · ${formatMoney(o.total, cfg)}\n` +
        o.items.map((i) => `   ${esc(i.name)}${i.variantName ? ` (${esc(i.variantName)})` : ""} × ${i.quantity}`).join("\n"),
    );
    await ctx.reply(`${tr(lang, "bot.myOrdersTitle")}\n\n${lines.join("\n\n")}`, { parse_mode: "HTML" });
  });

  // Buyer uploads a payment receipt for a manual-transfer order.
  bot.on(["message:photo", "message:document"], async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const lang = pickLocale(ctx.from.language_code);
    const user = await getUserByTgId(ctx.from.id);
    const order = user ? await findPendingManualOrder(user.id) : null;
    if (!order) return void (await ctx.reply(tr(lang, "bot.noOrderForReceipt")));

    const fileId = ctx.message.photo 
    ? ctx.message.photo[ctx.message.photo.length - 1].file_id
    : ctx.message.document?.file_id; 
    if (!fileId) return;

    await attachReceipt(order.id, fileId);
    const chat = adminChat();
    if (chat !== null) {
      const full = await getOrderFull(order.id);
      if (ctx.message.photo) { 
        await ctx.api.sendPhoto(chat, fileId, { 
          caption: tr(null, "admin.receipt", { id: order.id }), reply_markup: full ? adminKeyboard(full.order) : undefined, 
        }) 
      } else { 
        await ctx.api.sendDocument(chat, fileId, { 
          caption: tr(null, "admin.receipt", { id: order.id }), reply_markup: full ? adminKeyboard(full.order) : undefined, }) 
        }
    }
    await ctx.reply(tr(lang, "bot.receiptReceived"));
  });
}
