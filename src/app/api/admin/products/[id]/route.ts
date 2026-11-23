import { fail, json, withAdmin } from "@/server/http";
import { updateProductAdmin } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  if (!Number.isInteger(Number(id))) return fail("Bad id");
  const body = (await req.json()) as { stock?: number; price?: number; active?: boolean; images?: unknown };
  const patch: { stock?: number; price?: number; active?: boolean; images?: string[] } = {
    stock: body.stock,
    price: body.price,
    active: body.active,
  };
  if (body.images !== undefined) {
    const images = body.images;
    if (
      !Array.isArray(images) ||
      images.length > 20 ||
      !images.every((image): image is string => typeof image === "string" && image.length <= 2048)
    ) {
      return fail("Invalid images");
    }
    patch.images = images.map((image) => image.trim()).filter(Boolean);
  }
  await updateProductAdmin(Number(id), patch);
  return json({ ok: true });
});
