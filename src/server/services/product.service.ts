import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, productVariants, products } from "@/db/schema";
import type { CategoryDto, ProductDto } from "@/types";
import { ensureSeeded } from "../seed";

export type ProductSort = "popular" | "price_asc" | "price_desc" | "new";

export interface ProductFilter {
  categoryId?: number;
  q?: string;
  min?: number;
  max?: number;
  sort?: ProductSort;
  includeInactive?: boolean;
  ids?: number[];
}

export async function listCategories(): Promise<CategoryDto[]> {
  await ensureSeeded();
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, parentId: c.parentId }));
}

async function hydrate(rows: (typeof products.$inferSelect)[]): Promise<ProductDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const variants = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, ids))
    .orderBy(asc(productVariants.id));
  const cats = await db.select().from(categories);
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  return rows.map((p) => {
    const vs = variants
      .filter((v) => v.productId === p.id)
      .map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price ?? p.price,
        stock: v.stock,
        inStock: v.stock > 0,
      }));
    const stock = vs.length ? vs.reduce((s, v) => s + v.stock, 0) : p.stock;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      categoryName: p.categoryId ? (catName.get(p.categoryId) ?? null) : null,
      price: vs.length ? Math.min(...vs.map((v) => v.price)) : p.price,
      images: p.images,
      specs: p.specs,
      stock,
      inStock: stock > 0,
      active: p.active,
      variants: vs,
    };
  });
}

export async function listProducts(f: ProductFilter = {}): Promise<ProductDto[]> {
  await ensureSeeded();
  const conds: SQL[] = [];
  if (!f.includeInactive) conds.push(eq(products.active, true));
  if (f.ids?.length) conds.push(inArray(products.id, f.ids));
  if (f.categoryId) {
    const cats = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, f.categoryId));
    conds.push(inArray(products.categoryId, [f.categoryId, ...cats.map((c) => c.id)]));
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, "\\$&")}%`;
    const c = or(ilike(products.name, like), ilike(products.sku, like), ilike(products.description, like));
    if (c) conds.push(c);
  }
  if (f.min !== undefined && Number.isFinite(f.min)) conds.push(gte(products.price, f.min));
  if (f.max !== undefined && Number.isFinite(f.max)) conds.push(lte(products.price, f.max));

  const order =
    f.sort === "price_asc"
      ? [asc(products.price)]
      : f.sort === "price_desc"
        ? [desc(products.price)]
        : f.sort === "new"
          ? [desc(products.createdAt), desc(products.id)]
          : [asc(products.id)];

  const rows = await db
    .select()
    .from(products)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...order);
  return hydrate(rows);
}

export async function getProduct(id: number): Promise<ProductDto | null> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) return null;
  return (await hydrate([row]))[0];
}

export async function updateProductAdmin(
  id: number,
  patch: { stock?: number; price?: number; active?: boolean; images?: string[] },
) {
  const set: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (patch.stock !== undefined) set.stock = Math.max(0, Math.floor(patch.stock));
  if (patch.price !== undefined && patch.price >= 0) set.price = patch.price;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.images !== undefined) set.images = patch.images;
  await db.update(products).set(set).where(eq(products.id, id));
}

/** Decrease stock of a product or variant (never below zero). */
export async function adjustStock(
  tx: Pick<typeof db, "update">,
  item: { productId: number | null; variantId: number | null },
  delta: number,
) {
  if (item.variantId) {
    await tx
      .update(productVariants)
      .set({ stock: sql`greatest(${productVariants.stock} + ${delta}, 0)` })
      .where(eq(productVariants.id, item.variantId));
  } else if (item.productId) {
    await tx
      .update(products)
      .set({ stock: sql`greatest(${products.stock} + ${delta}, 0)`, updatedAt: new Date() })
      .where(eq(products.id, item.productId));
  }
}
