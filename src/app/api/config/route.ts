import { availablePaymentMethods } from "@/server/config";
import { getDict } from "@/server/locale";
import { json, safe } from "@/server/http";
import { getEffectiveConfig } from "@/server/services/store-settings.service";
import type { ClientConfig, PaymentMethod } from "@/types";

export const dynamic = "force-dynamic";

export const GET = safe(async () => {
  const cfg = await getEffectiveConfig();
  const locale = cfg.defaultLocale;
  const body: ClientConfig = {
    storeName: cfg.storeName,
    currencyCode: cfg.currencyCode,
    currencySymbol: cfg.currencySymbol,
    locale,
    dict: getDict(locale),
    paymentMethods: availablePaymentMethods(cfg) as PaymentMethod[],
    delivery: {
      courierFee: cfg.courierFee,
      postFee: cfg.postFee,
      freeFrom: cfg.freeDeliveryFrom,
      pickupPoints: cfg.pickupPoints,
    },
    botUsername: cfg.botUsername,
    isDevAuth: cfg.allowDevAuth,
  };
  return json(body);
});
