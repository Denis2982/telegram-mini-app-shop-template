import { json, safe } from "@/server/http";
import { listProducts, type ProductSort } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

const num = (v: string | null) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

export const GET = safe(async (req) => {
  const sp = new URL(req.url).searchParams;
  const sort = sp.get("sort");
  const products = await listProducts({
    categoryId: num(sp.get("category")),
    q: sp.get("q") ?? undefined,
    min: num(sp.get("min")),
    max: num(sp.get("max")),
    sort: (["price_asc", "price_desc", "new"].includes(sort ?? "") ? sort : "popular") as ProductSort,
  });
  return json(products);
});
