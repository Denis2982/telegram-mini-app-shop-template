import { json, withAdmin } from "@/server/http";
import { deletePromoCode, parsePromoCodeInput, updatePromoCode } from "@/server/services/promo.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

export const PATCH = withAdmin<RouteContext>(async (req, { params }) => {
  const { code } = await params;
  const input = parsePromoCodeInput(await req.json().catch(() => null));
  return json(await updatePromoCode(code, input));
});

export const DELETE = withAdmin<RouteContext>(async (_req, { params }) => {
  const { code } = await params;
  await deletePromoCode(code);
  return json({ ok: true });
});
