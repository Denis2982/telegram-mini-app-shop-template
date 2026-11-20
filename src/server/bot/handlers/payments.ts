import type { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { tr } from "../../locale";
import { applyAction } from "../../services/order.service";

const parse = (payload: string) => {
  const m = payload.match(/^order:(\d+)$/);
  return m ? Number(m[1]) : null;
};

export function registerPayments(bot: Bot) {
  bot.on("pre_checkout_query", async (ctx) => {
    const id = parse(ctx.preCheckoutQuery.invoice_payload);
    const [o] = id ? await db.select().from(orders).where(eq(orders.id, id)) : [];
    if (!o || o.paymentStatus === "paid" || o.status === "cancelled") {
      return void (await ctx.answerPreCheckoutQuery(false, tr(ctx.from.language_code, "bot.preCheckoutFail")));
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const id = parse(ctx.message.successful_payment.invoice_payload);
    if (id) await applyAction(id, "pay");
  });
}
