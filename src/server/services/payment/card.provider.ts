import type { PaymentInstruction } from "@/types";
import { getApi } from "../../bot/notify";
import { getConfig } from "../../config";
import { tr } from "../../locale";
import type { IPaymentProvider, PaymentContext } from "./payment.interface";

/** Bank acquiring (YooKassa / Stripe / LiqPay…) through Telegram Payments and PAYMENT_PROVIDER_TOKEN. */
export class CardProvider implements IPaymentProvider {
  readonly id = "card" as const;

  isEnabled() {
    const c = getConfig();
    return Boolean(c.botToken && c.paymentProviderToken);
  }

  async createPayment({ order, user }: PaymentContext): Promise<PaymentInstruction> {
    const api = getApi();
    if (!api) return { type: "none", error: "bot_not_configured" };
    const cfg = getConfig();
    const title = tr(user.languageCode, "bot.invoiceTitle", { id: order.id });
    const desc = tr(user.languageCode, "bot.invoiceDescription", { id: order.id, store: cfg.storeName });
    const url = await api.createInvoiceLink(title, desc, `order:${order.id}`, cfg.paymentProviderToken, cfg.currencyCode, [
      { label: title, amount: Math.round(order.total * 100) },
    ]);
    return { type: "invoice", url };
  }
}
