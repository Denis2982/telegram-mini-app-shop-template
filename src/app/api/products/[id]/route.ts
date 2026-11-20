import { fail, json, safe } from "@/server/http";
import { getProduct } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const GET = safe<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const p = Number.isInteger(Number(id)) ? await getProduct(Number(id)) : null;
  return p ? json(p) : fail("Not found", 404);
});
