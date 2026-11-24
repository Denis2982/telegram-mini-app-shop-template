import { Readable } from "node:stream";
import { Workbook, type Cell } from "exceljs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, productVariants, products } from "@/db/schema";
import type { OrderDto } from "@/types";

export const EXPORT_HEADERS = ["SKU", "Name", "Category", "Price", "Stock", "Image", "Description"] as const;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_COLUMNS = 64;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 15_000;

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
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.columns = EXPORT_HEADERS.map((header) => ({ header, key: header }));
  sheet.addRows(data);
  if (format === "csv") {
    const csv = await workbook.csv.writeBuffer({ sheetName: "Products" });
    return Buffer.concat([Buffer.from("\ufeff"), Buffer.from(csv)]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportOrdersToExcel(orders: OrderDto[]) {
  const statusNames: Record<OrderDto["status"], string> = {
    new: "Новый",
    paid: "Оплачен",
    processing: "В сборке",
    shipped: "Отправлен",
    completed: "Завершён",
    cancelled: "Отклонён",
  };
  const paymentNames: Record<OrderDto["paymentMethod"], string> = {
    stars: "Telegram Stars",
    card: "Карта",
    manual: "Ручная оплата",
  };

  const data = orders.map((order) => {
    const telegram = order.customerUsername
      ? `@${order.customerUsername}${order.customerTelegramId ? ` (ID: ${order.customerTelegramId})` : ""}`
      : order.customerTelegramId
        ? `ID: ${order.customerTelegramId}`
        : "";
    const customer = [
      order.customerName,
      order.customerPhone,
      telegram,
    ].filter(Boolean).join(", ");
    const composition = order.items
      .map((item) => `${item.name}${item.variantName ? ` (${item.variantName})` : ""} — ${item.quantity} шт.`)
      .join("; ");

    return {
      "ID заказа": order.id,
      "Дата и время создания": order.createdAt,
      "Клиент (Имя, Телефон, Telegram Username/ID)": customer,
      "Состав заказа": composition,
      "Итоговая сумма": `${order.total} ${order.currency}`,
      "Способ оплаты": paymentNames[order.paymentMethod],
      "Статус заказа": statusNames[order.status],
    };
  });

  const headers = [
    "ID заказа",
    "Дата и время создания",
    "Клиент (Имя, Телефон, Telegram Username/ID)",
    "Состав заказа",
    "Итоговая сумма",
    "Способ оплаты",
    "Статус заказа",
  ];
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.max(header.length + 2, ...data.map((row) => String(row[header as keyof typeof row] ?? "").length + 2).slice(0, 200)),
  }));
  sheet.addRows(data);
  return Buffer.from(await workbook.xlsx.writeBuffer());
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

function readCellValue(cell: Cell): unknown {
  const value = cell.value;
  if (value === undefined || value === null) return "";
  if (typeof value !== "object" || value instanceof Date) return value;
  if ("text" in value) return value.text;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("result" in value) return value.result ?? "";
  return "";
}

export async function importProducts(buf: Buffer): Promise<ImportResult> {
  if (buf.length > MAX_IMPORT_BYTES) throw new Error("File exceeds the 10 MB limit");
  if (buf.length === 0) return { created: 0, updated: 0, errors: [{ row: 0, message: "Empty file" }] };

  const workbook = new Workbook();
  const isXlsx = buf[0] === 0x50 && buf[1] === 0x4b;
  const isLegacyXls = buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (isLegacyXls) throw new Error("Legacy .xls files are not supported; use .xlsx or .csv");
  if (isXlsx) {
    const workbookBuffer = new ArrayBuffer(buf.length);
    new Uint8Array(workbookBuffer).set(buf);
    await workbook.xlsx.load(workbookBuffer);
  } else await workbook.csv.read(Readable.from([buf]));

  const sheet = workbook.worksheets[0];
  if (!sheet) return { created: 0, updated: 0, errors: [{ row: 0, message: "Empty file" }] };
  if (sheet.rowCount > MAX_IMPORT_ROWS + 1) {
    return { created: 0, updated: 0, errors: [{ row: 0, message: `File exceeds the ${MAX_IMPORT_ROWS} row limit` }] };
  }
  const headerRow = sheet.getRow(1);
  if (headerRow.cellCount > MAX_IMPORT_COLUMNS) {
    return { created: 0, updated: 0, errors: [{ row: 1, message: `File exceeds the ${MAX_IMPORT_COLUMNS} column limit` }] };
  }

  const headers = new Map<number, (typeof EXPORT_HEADERS)[number]>();
  for (let column = 1; column <= headerRow.cellCount; column++) {
    const name = String(readCellValue(headerRow.getCell(column))).trim().toLowerCase().replace(/^\ufeff/, "");
    const key = ALIASES[name];
    if (key) headers.set(column, key);
  }

  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const catCache = new Map<string, number>();
  for (const c of await db.select().from(categories)) catCache.set(c.name.toLowerCase(), c.id);

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const source = sheet.getRow(rowNum);
    if (!source.hasValues) continue;
    const row: Partial<Record<(typeof EXPORT_HEADERS)[number], unknown>> = {};
    for (const [column, key] of headers) row[key] = readCellValue(source.getCell(column));
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

function isAllowedGoogleHost(url: URL, allowUserContent: boolean) {
  const allowedHost =
    url.hostname === "docs.google.com" ||
    (allowUserContent && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")));
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && allowedHost;
}

async function readLimitedBody(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) {
    throw new Error("Downloaded file exceeds the 10 MB limit");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMPORT_BYTES) {
      await reader.cancel();
      throw new Error("Downloaded file exceeds the 10 MB limit");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

/** Downloads an accessible Google Sheet and imports its CSV export. */
export async function importFromUrl(url: string) {
  let input: URL;
  try {
    input = new URL(url.trim());
  } catch {
    throw new Error("Invalid Google Sheets URL");
  }
  if (!isAllowedGoogleHost(input, false)) throw new Error("Only HTTPS Google Sheets URLs are supported");
  const match = input.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (!match) throw new Error("Invalid Google Sheets URL");

  const gid = input.searchParams.get("gid") ?? new URLSearchParams(input.hash.slice(1)).get("gid");
  const target = new URL(`/spreadsheets/d/${match[1]}/export`, "https://docs.google.com");
  target.searchParams.set("format", "csv");
  if (gid && /^\d+$/.test(gid)) target.searchParams.set("gid", gid);

  let current = target;
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects while downloading Google Sheet");
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid redirect while downloading Google Sheet");
      await response.body?.cancel();
      const next = new URL(location, current);
      if (!isAllowedGoogleHost(next, true)) throw new Error("Google Sheets redirected to an unsupported host");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType && !["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"].includes(contentType)) {
      throw new Error("Google Sheets did not return a CSV file");
    }
    return importProducts(await readLimitedBody(response));
  }
}
