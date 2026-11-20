import { json, withUser } from "@/server/http";
import { createOrder, listUserOrders } from "@/server/services/order.service";
import type { CreateOrderInput } from "@/types";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_req, user) => json(await listUserOrders(user.id)));

export const POST = withUser(async (req, user) => {
  const input = (await req.json()) as CreateOrderInput;
  return json(await createOrder(user, input), 201);
});
