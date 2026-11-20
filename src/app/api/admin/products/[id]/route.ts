import { fail, json, withAdmin } from "@/server/http";
import { updateProductAdmin } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  if (!Number.isInteger(Number(id))) return fail("Bad id");
  const body = (await req.json()) as { stock?: number; price?: number; active?: boolean };
  await updateProductAdmin(Number(id), body);
  return json({ ok: true });
});
