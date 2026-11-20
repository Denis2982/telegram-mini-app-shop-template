import { fail, json, withUser } from "@/server/http";
import { createPayment, getOrderFull } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

/** (Re)creates a payment instruction for an unpaid order. */
export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, user, { params }) => {
  const { id } = await params;
  const full = Number.isInteger(Number(id)) ? await getOrderFull(Number(id)) : null;
  if (!full || full.order.userId !== user.id) return fail("Not found", 404);
  if (full.order.paymentStatus === "paid" || full.order.status === "cancelled") return fail("Not payable", 409);
  return json(await createPayment(full.order, full.items, user));
});
