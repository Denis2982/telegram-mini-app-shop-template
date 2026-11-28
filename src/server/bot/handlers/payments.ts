import type { Bot } from "grammy";
import { trDefault } from "../../locale";
import { applyAction, validateTelegramPreCheckout } from "../../services/order.service";

const parse = (payload: string) => {
  const m = payload.match(/^order:(\d+)$/);
  return m ? Number(m[1]) : null;
};

export function registerPayments(bot: Bot) {
  bot.on("pre_checkout_query", async (ctx) => {
    const query = ctx.preCheckoutQuery;
    const accepted = await validateTelegramPreCheckout(parse(query.invoice_payload), {
      telegramUserId: ctx.from.id,
      totalAmount: query.total_amount,
      currency: query.currency,
    });
    if (!accepted) {
      return void (await ctx.answerPreCheckoutQuery(false, trDefault("bot.preCheckoutFail")));
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    const id = parse(payment.invoice_payload);
    if (!id) return;
    const result = await applyAction(id, "pay", {
      telegramUserId: ctx.from.id,
      totalAmount: payment.total_amount,
      currency: payment.currency,
    });
    if ("error" in result) console.error("Could not apply successful Telegram payment", { orderId: id, error: result.error });
  });
}
