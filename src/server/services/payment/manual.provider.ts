import type { PaymentInstruction } from "@/types";
import { getApi } from "../../bot/notify";
import { formatMoney, getConfig } from "../../config";
import { trDefault } from "../../locale";
import { getEffectiveConfig } from "../store-settings.service";
import { esc } from "../../bot/notify";
import type { IPaymentProvider, PaymentContext } from "./payment.interface";

/** Manual bank transfer: bot sends the requisites, buyer uploads a receipt, manager confirms. */
export class ManualProvider implements IPaymentProvider {
  readonly id = "manual" as const;

  isEnabled() {
    return Boolean(getConfig().manualDetails);
  }

  async createPayment({ order, user }: PaymentContext): Promise<PaymentInstruction> {
    const cfg = await getEffectiveConfig();
    const details = cfg.manualDetails.replace(/\\n/g, "\n");
    const api = getApi();
    if (api && user.tgId > 1) {
      try {
        await api.sendMessage(
          user.tgId,
          trDefault("bot.manualInstructions", {
            id: order.id,
            total: formatMoney(order.total, cfg),
            details: esc(details),
          }),
          { parse_mode: "HTML" },
        );
      } catch (e) {
        console.error("manual instructions failed", e);
      }
    }
    return { type: "manual", details };
  }
}
