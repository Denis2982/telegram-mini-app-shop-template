import * as XLSX from "xlsx";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, productVariants, products } from "@/db/schema";

export const EXPORT_HEADERS = ["SKU", "Name", "Category", "Price", "Stock", "Image", "Description"] as const;

const ALIASES: Record<string, (typeof EXPORT_HEADERS)[number]> = {
  sku: "SKU",
  артикул: "SKU",
  name: "Name",
  название: "Name",
  наименование: "Name",
  category: "Category",
  категория: "Category",
  price: "Price",
  цена: "Price",
  stock: "Stock",
  остаток: "Stock",
  image: "Image",
  photo: "Image",
  фото: "Image",
  "ссылка на фото": "Image",
  description: "Description",
  описание: "Description",
};

export async function exportProducts(format: "xlsx" | "csv") {
  const rows = await db
    .select({ p: products, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(products.id);
  const variantStock = await db
    .select({ productId: productVariants.productId, stock: sql<number>`sum(${productVariants.stock})::int` })
    .from(productVariants)
    .groupBy(productVariants.productId);
  const vs = new Map(variantStock.map((v) => [v.productId, v.stock]));

  const data = rows.map(({ p, categoryName }) => ({
    SKU: p.sku,
    Name: p.name,
    Category: categoryName ?? "",
    Price: p.price,
    Stock: vs.get(p.id) ?? p.stock,
    Image: p.images.join(","),
    Description: p.description,
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: [...EXPORT_HEADERS] });
  if (format === "csv") return Buffer.from("\ufeff" + XLSX.utils.sheet_to_csv(ws), "utf8");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "cat";

export async function importProducts(buf: Buffer): Promise<ImportResult> {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { created: 0, updated: 0, errors: [{ row: 0, message: "Empty file" }] };
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const catCache = new Map<string, number>();
  for (const c of await db.select().from(categories)) catCache.set(c.name.toLowerCase(), c.id);

  let rowNum = 1;
  for (const r of raw) {
    rowNum++;
    const row: Partial<Record<(typeof EXPORT_HEADERS)[number], unknown>> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = ALIASES[k.trim().toLowerCase().replace(/^\ufeff/, "")];
      if (key) row[key] = v;
    }
    const sku = String(row.SKU ?? "").trim();
    const name = String(row.Name ?? "").trim();
    const price = Number(String(row.Price ?? "").replace(/\s/g, "").replace(",", "."));
    const stock = Math.max(0, Math.floor(Number(String(row.Stock ?? "0").replace(/\s/g, "")) || 0));
    if (!sku || !name) {
      result.errors.push({ row: rowNum, message: "SKU and Name are required" });
      continue;
    }
    if (!Number.isFinite(price) || price < 0) {
      result.errors.push({ row: rowNum, message: "Invalid price" });
      continue;
    }
    try {
      let categoryId: number | null = null;
      const catName = String(row.Category ?? "").trim();
      if (catName) {
        categoryId = catCache.get(catName.toLowerCase()) ?? null;
        if (!categoryId) {
          let slug = slugify(catName);
          const [exists] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
          if (exists) slug = `${slug}-${Date.now() % 10000}`;
          const [c] = await db.insert(categories).values({ name: catName, slug }).returning();
          categoryId = c.id;
          catCache.set(catName.toLowerCase(), c.id);
        }
      }
      const images = String(row.Image ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const description = String(row.Description ?? "");

      const [existing] = await db.select().from(products).where(eq(products.sku, sku));
      if (existing) {
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(productVariants)
          .where(eq(productVariants.productId, existing.id));
        await db
          .update(products)
          .set({
            name,
            price,
            categoryId,
            ...(n === 0 ? { stock } : {}),
            ...(images.length ? { images } : {}),
            ...(description ? { description } : {}),
            updatedAt: new Date(),
          })
          .where(eq(products.id, existing.id));
        result.updated++;
      } else {
        await db.insert(products).values({ sku, name, price, categoryId, stock, images, description });
        result.created++;
      }
    } catch (e) {
      result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : "Error" });
    }
  }
  return result;
}

/** Downloads a published Google Sheet (or any CSV/XLSX url) and imports it. */
export async function importFromUrl(url: string) {
  let target = url.trim();
  const m = target.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) {
    const gid = target.match(/[#&?]gid=(\d+)/)?.[1];
    target = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  }
  if (!/^https?:\/\//.test(target)) throw new Error("Invalid URL");
  const res = await fetch(target, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return importProducts(Buffer.from(await res.arrayBuffer()));
}
