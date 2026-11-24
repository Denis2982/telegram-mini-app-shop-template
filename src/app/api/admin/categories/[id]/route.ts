import { fail, json, withAdmin } from "@/server/http";
import { deleteCategoryAdmin, renameCategoryAdmin } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  if (!Number.isInteger(Number(id))) return fail("Bad id");
  const body = await req.json().catch(() => null) as { name?: unknown } | null;
  if (!body || typeof body.name !== "string") return fail("Category name is required");
  await renameCategoryAdmin(Number(id), body.name);
  return json({ ok: true });
});

export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  if (!Number.isInteger(Number(id))) return fail("Bad id");
  await deleteCategoryAdmin(Number(id));
  return json({ ok: true });
});
