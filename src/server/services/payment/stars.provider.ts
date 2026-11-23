import type { PaymentInstruction } from "@/types";
import { getApi } from "../../bot/notify";
import { getConfig } from "../../config";
import { getEffectiveConfig } from "../store-settings.service";
import { tr } from "../../locale";
import type { IPaymentProvider, PaymentContext } from "./payment.interface";

/** Telegram Stars (XTR): invoice link opened with WebApp.openInvoice. */
export class StarsProvider implements IPaymentProvider {
  readonly id = "stars" as const;

  isEnabled() {
    const c = getConfig();
    return Boolean(c.botToken && c.starsEnabled);
  }

  async createPayment({ order, user }: PaymentContext): Promise<PaymentInstruction> {
    const api = getApi();
    if (!api) return { type: "none", error: "bot_not_configured" };
    const cfg = await getEffectiveConfig();
    const amount = Math.max(1, Math.ceil(order.total * cfg.starsPerUnit));
    const title = tr(user.languageCode, "bot.invoiceTitle", { id: order.id });
    const desc = tr(user.languageCode, "bot.invoiceDescription", { id: order.id, store: cfg.storeName });
    const url = await api.createInvoiceLink(title, desc, `order:${order.id}`, "", "XTR", [{ label: title, amount }]);
    return { type: "invoice", url };
  }
}
