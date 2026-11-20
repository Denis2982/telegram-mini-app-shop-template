import { fail, json, withAdmin } from "@/server/http";
import { applyAction, type OrderAction } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { action } = (await req.json()) as { action?: string };
  if (!Number.isInteger(Number(id)) || !["pay", "processing", "shipped", "completed", "cancel"].includes(action ?? "")) {
    return fail("Bad request");
  }
  const res = await applyAction(Number(id), action as OrderAction);
  if ("error" in res) return fail(String(res.error), 409);
  return json({ ok: true, status: res.order.status });
});
