import { json, withAdmin } from "@/server/http";
import { listProducts } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => json(await listProducts({ includeInactive: true })));
