import { fail, json, withAdmin } from "@/server/http";
import { getStoreSettings, saveStoreSettings } from "@/server/services/store-settings.service";
import type { StoreSettingsDto } from "@/types";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => json(await getStoreSettings()));

export const PUT = withAdmin(async (req) => {
  const body: unknown = await req.json();
  if (!body || typeof body !== "object") return fail("Invalid settings");
  const input = body as Record<string, unknown>;
  const pickupPoints = input.pickupPoints;
  if (
    typeof input.manualDetails !== "string" ||
    input.manualDetails.length > 5000 ||
    !Array.isArray(pickupPoints) ||
    pickupPoints.length === 0 ||
    pickupPoints.length > 30 ||
    !pickupPoints.every((point): point is string => typeof point === "string" && point.trim().length > 0 && point.length <= 250) ||
    typeof input.currencyCode !== "string" ||
    !/^[a-z]{3}$/i.test(input.currencyCode.trim()) ||
    typeof input.currencySymbol !== "string" ||
    !input.currencySymbol.trim() ||
    input.currencySymbol.trim().length > 8
  ) {
    return fail("Invalid settings");
  }

  const settings: StoreSettingsDto = {
    manualDetails: input.manualDetails,
    pickupPoints: pickupPoints.map((point) => point.trim()),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    currencySymbol: input.currencySymbol.trim(),
  };
  await saveStoreSettings(settings);
  return json(await getStoreSettings());
});
