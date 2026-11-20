import { json, withUser } from "@/server/http";
import { computePromo } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

export const POST = withUser(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { code?: string; subtotal?: number };
  const promo = await computePromo(body.code, Number(body.subtotal) || 0);
  return json(promo ? { valid: true, code: promo.code, discount: promo.discount } : { valid: false });
});
