import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, productVariants, products } from "@/db/schema";
import type { CategoryDto, ProductDto } from "@/types";
import { ensureSeeded } from "../seed";
import { HttpError } from "../http";
import { releaseExpiredStockReservations } from "./stock.service";

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
  await releaseExpiredStockReservations();
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
  await releaseExpiredStockReservations();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) return null;
  return (await hydrate([row]))[0];
}

function slugify(value: string) {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",
    ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  return value
    .toLowerCase()
    .trim()
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createProductAdmin(input: {
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  active: boolean;
  images: string[];
  categoryId: number | null;
  newCategoryName?: string;
  variants: { name: string; sku?: string; stock: number; price?: number }[];
}) {
  return db.transaction(async (tx) => {
    let categoryId = input.categoryId;
    if (input.newCategoryName?.trim()) {
      const name = input.newCategoryName.trim();
      const [existing] = await tx.select().from(categories).where(eq(categories.name, name)).limit(1);
      if (existing) {
        categoryId = existing.id;
      } else {
        const baseSlug = slugify(name) || `category-${Date.now()}`;
        let slug = baseSlug;
        let suffix = 2;
        while (await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1).then((rows) => rows.length)) {
          slug = `${baseSlug}-${suffix++}`;
        }
        const [created] = await tx.insert(categories).values({ name, slug }).returning();
        categoryId = created.id;
      }
    }

    const totalStock = input.variants.length
      ? input.variants.reduce((sum, variant) => sum + variant.stock, 0)
      : input.stock;

    let created;
    try {
      [created] = await tx.insert(products).values({
        sku: input.sku,
        name: input.name,
        description: input.description,
        categoryId,
        price: input.price,
        images: input.images,
        stock: totalStock,
        active: input.active,
      }).returning();
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code
        ?? (error as { code?: string }).code;
      if (code === "23505") throw new HttpError("A product with this SKU already exists", 409);
      throw error;
    }

    if (input.variants.length) {
      await tx.insert(productVariants).values(
        input.variants.map((variant) => ({
          productId: created.id,
          name: variant.name,
          sku: variant.sku?.trim() || null,
          stock: variant.stock,
          price: variant.price ?? null,
        })),
      );
    }
    return created.id;
  });
}

export async function updateProductAdmin(
  id: number,
  patch: {
    stock?: number;
    price?: number;
    active?: boolean;
    images?: string[];
    variants?: { id: number; stock: number; price?: number }[];
  },
) {
  if (patch.variants) {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: productVariants.id, price: productVariants.price })
        .from(productVariants)
        .where(eq(productVariants.productId, id));
      const existingIds = new Set(existing.map((variant) => variant.id));
      const submittedIds = new Set(patch.variants!.map((variant) => variant.id));
      if (
        submittedIds.size !== patch.variants!.length ||
        patch.variants!.some((variant) => !existingIds.has(variant.id)) ||
        submittedIds.size !== existingIds.size
      ) {
        throw new HttpError("Invalid product variant", 400);
      }

      for (const variant of patch.variants!) {
        await tx
          .update(productVariants)
          .set({
            stock: variant.stock,
            ...(variant.price === undefined ? {} : { price: variant.price }),
          })
          .where(and(eq(productVariants.id, variant.id), eq(productVariants.productId, id)));
      }

      const totalStock = patch.variants!.reduce((sum, variant) => sum + variant.stock, 0);
      const productRow = await tx
        .select({ price: products.price })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);
      const fallbackPrice = productRow[0]?.price ?? 0;
      const effectivePrices = patch.variants!.map((variant) => {
        if (variant.price !== undefined) return variant.price;
        return existing.find((item) => item.id === variant.id)?.price ?? fallbackPrice;
      });
      const lowestPrice = Math.min(...effectivePrices);
      await tx
        .update(products)
        .set({ stock: totalStock, price: lowestPrice, updatedAt: new Date() })
        .where(eq(products.id, id));
    });
  }

  const set: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (!patch.variants && patch.stock !== undefined) {
    const existing = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .limit(1);
    if (existing.length) throw new HttpError("Edit variant stock through variants", 400);
    set.stock = Math.max(0, Math.floor(patch.stock));
  }
  if (patch.price !== undefined && patch.price >= 0) set.price = patch.price;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.images !== undefined) set.images = patch.images;
  await db.update(products).set(set).where(eq(products.id, id));
}

export async function deleteProductAdmin(id: number) {
  const deleted = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  if (!deleted.length) throw new HttpError("Product not found", 404);
}

export async function listAdminCategories() {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
  const productRows = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(sql`${products.categoryId} is not null`);
  const counts = new Map<number, number>();
  for (const row of productRows) {
    if (row.categoryId !== null) counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  }
  return rows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    productCount: counts.get(category.id) ?? 0,
  }));
}

export async function renameCategoryAdmin(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new HttpError("Category name is required", 400);
  const [duplicate] = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, trimmed)).limit(1);
  if (duplicate && duplicate.id !== id) throw new HttpError("Category already exists", 409);

  const baseSlug = slugify(trimmed) || `category-${id}`;
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!existing || existing.id === id) break;
    slug = `${baseSlug}-${suffix++}`;
  }
  const updated = await db
    .update(categories)
    .set({ name: trimmed, slug })
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (!updated.length) throw new HttpError("Category not found", 404);
}

export async function deleteCategoryAdmin(id: number) {
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).limit(1);
  if (!category) throw new HttpError("Category not found", 404);

  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.categoryId, id)).limit(1);
  if (product) throw new HttpError("Category contains products", 409);

  const [child] = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id)).limit(1);
  if (child) throw new HttpError("Category contains subcategories", 409);

  await db.delete(categories).where(eq(categories.id, id));
}
