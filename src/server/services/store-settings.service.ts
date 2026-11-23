import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import type { StoreSettingsDto } from "@/types";
import { getConfig, type AppConfig } from "../config";

const SETTINGS_KEY = "default";

export async function getStoreSettings(): Promise<StoreSettingsDto> {
  const cfg = getConfig();
  const [saved] = await db.select().from(storeSettings).where(eq(storeSettings.key, SETTINGS_KEY)).limit(1);
  return {
    manualDetails: saved?.manualPaymentDetails ?? cfg.manualDetails,
    pickupPoints: saved?.pickupPoints ?? cfg.pickupPoints,
    currencyCode: saved?.currencyCode ?? cfg.currencyCode,
    currencySymbol: saved?.currencySymbol ?? cfg.currencySymbol,
  };
}

export async function getEffectiveConfig(): Promise<AppConfig> {
  return { ...getConfig(), ...(await getStoreSettings()) };
}

export async function saveStoreSettings(settings: StoreSettingsDto) {
  const values = {
    key: SETTINGS_KEY,
    manualPaymentDetails: settings.manualDetails,
    pickupPoints: settings.pickupPoints,
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    updatedAt: new Date(),
  };
  await db
    .insert(storeSettings)
    .values(values)
    .onConflictDoUpdate({
      target: storeSettings.key,
      set: {
        manualPaymentDetails: values.manualPaymentDetails,
        pickupPoints: values.pickupPoints,
        currencyCode: values.currencyCode,
        currencySymbol: values.currencySymbol,
        updatedAt: values.updatedAt,
      },
    });
}
