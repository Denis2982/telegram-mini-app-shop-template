import { fail, json, withUser } from "@/server/http";
import { getOrderFull, toOrderDto } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

export const GET = withUser<{ params: Promise<{ id: string }> }>(async (_req, user, { params }) => {
  const { id } = await params;
  const full = Number.isInteger(Number(id)) ? await getOrderFull(Number(id)) : null;
  if (!full || full.order.userId !== user.id) return fail("Not found", 404);
  return json(toOrderDto(full.order, full.items, full.user));
});
