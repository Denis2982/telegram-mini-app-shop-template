import { json, withAdmin } from "@/server/http";
import { listAllOrders } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => json(await listAllOrders()));
