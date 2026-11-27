import { fail, json, withAdmin } from "@/server/http";
import { deleteProductAdmin, updateProductAdmin } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  if (!Number.isInteger(Number(id))) return fail("Bad id");
  const body = (await req.json()) as {
    stock?: number;
    price?: number;
    active?: boolean;
    images?: unknown;
    variants?: unknown;
  };
  const patch: {
    stock?: number;
    price?: number;
    active?: boolean;
    images?: string[];
    variants?: { id: number; stock: number; price?: number }[];
  } = {
    stock: body.stock,
    price: body.price,
    active: body.active,
  };
  if (body.stock !== undefined && (!Number.isFinite(body.stock) || body.stock < 0)) {
    return fail("Invalid stock");
  }
  if (body.variants !== undefined) {
    if (
      !Array.isArray(body.variants) ||
      body.variants.length === 0 ||
      !body.variants.every((variant) =>
        variant !== null &&
        typeof variant === "object" &&
        Number.isInteger((variant as { id?: unknown }).id) &&
        Number((variant as { id: number }).id) > 0 &&
        Number.isFinite((variant as { stock?: unknown }).stock) &&
        Number((variant as { stock: number }).stock) >= 0 &&
        ((variant as { price?: unknown }).price === undefined ||
          (Number.isFinite((variant as { price?: unknown }).price) &&
            Number((variant as { price: number }).price) >= 0)),
      )
    ) {
      return fail("Invalid variant price or stock");
    }
    patch.variants = body.variants.map((variant) => {
      const item = variant as { id: number; stock: number; price?: number };
      return {
        id: item.id,
        stock: Math.max(0, Math.floor(item.stock)),
        ...(item.price === undefined ? {} : { price: item.price }),
      };
    });
  }
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

export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  if (!Number.isInteger(Number(id))) return fail("Bad id");
  await deleteProductAdmin(Number(id));
  return json({ ok: true });
});
