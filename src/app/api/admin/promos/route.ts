import { json, withAdmin } from "@/server/http";
import { createPromoCode, listPromoCodes, parsePromoCodeInput } from "@/server/services/promo.service";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => json(await listPromoCodes()));

export const POST = withAdmin(async (req) => {
  const input = parsePromoCodeInput(await req.json().catch(() => null));
  return json(await createPromoCode(input), 201);
});
