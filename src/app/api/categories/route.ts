import { json, safe } from "@/server/http";
import { listCategories } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const GET = safe(async () => json(await listCategories()));
