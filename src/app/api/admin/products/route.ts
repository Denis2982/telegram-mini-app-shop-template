import { fail, json, withAdmin } from "@/server/http";
import { createProductAdmin, listProducts } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => json(await listProducts({ includeInactive: true })));

export const POST = withAdmin(async (req) => {
  const body = await req.json().catch(() => null) as
    | {
        sku?: unknown;
        name?: unknown;
        description?: unknown;
        price?: unknown;
        stock?: unknown;
        active?: unknown;
        images?: unknown;
        categoryId?: unknown;
        newCategoryName?: unknown;
        variants?: unknown;
      }
    | null;
  if (!body) return fail("Invalid JSON");

  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const price = Number(body.price);
  const hasVariants = Array.isArray(body.variants) && body.variants.length > 0;
  const stock = hasVariants ? 0 : Number(body.stock);
  const categoryId = body.categoryId === null || body.categoryId === "" ? null : Number(body.categoryId);
  const newCategoryName = typeof body.newCategoryName === "string" ? body.newCategoryName.trim() : "";

  if (!sku || !name || !Number.isFinite(price) || price < 0) {
    return fail("Name, SKU and a valid price are required");
  }
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    return fail("Invalid category");
  }
  if (!hasVariants && (!Number.isFinite(stock) || stock < 0)) {
    return fail("Invalid stock");
  }
  if (
    !Array.isArray(body.images) ||
    body.images.length > 20 ||
    !body.images.every((image) => typeof image === "string" && image.length <= 2048)
  ) {
    return fail("Invalid images");
  }

  let variants: { name: string; sku?: string; stock: number; price?: number }[] = [];
  if (body.variants !== undefined) {
    if (!Array.isArray(body.variants)) return fail("Invalid variants");
    if (
      body.variants.length > 0 &&
      !body.variants.every((variant) => {
        if (!variant || typeof variant !== "object") return false;
        const item = variant as { name?: unknown; stock?: unknown; sku?: unknown; price?: unknown };
        return (
          typeof item.name === "string" &&
          item.name.trim().length > 0 &&
          Number.isFinite(Number(item.stock)) &&
          Number(item.stock) >= 0 &&
          (item.sku === undefined || typeof item.sku === "string") &&
          (item.price === undefined || (Number.isFinite(Number(item.price)) && Number(item.price) >= 0))
        );
      })
    ) {
      return fail("Invalid variants");
    }
    variants = body.variants.map((variant) => {
      const item = variant as { name: string; stock: number; sku?: string; price?: number };
      return {
        name: item.name.trim(),
        sku: typeof item.sku === "string" ? item.sku.trim() : undefined,
        stock: Math.max(0, Math.floor(Number(item.stock))),
        price: item.price === undefined ? undefined : Number(item.price),
      };
    });
  }

  const id = await createProductAdmin({
    sku,
    name,
    description,
    price,
    stock: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0,
    active: body.active !== false,
    images: body.images.map((image) => image.trim()).filter(Boolean),
    categoryId,
    newCategoryName,
    variants,
  });
  return json({ id, ok: true }, 201);
});
