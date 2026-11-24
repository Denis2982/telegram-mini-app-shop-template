import { fail, json, withAdmin } from "@/server/http";
import { importFromUrl, importProducts, MAX_IMPORT_BYTES } from "@/server/services/excel.service";

export const dynamic = "force-dynamic";

/** multipart/form-data with `file` (XLSX/CSV) or JSON { url } (public Google Sheets link). */
export const POST = withAdmin(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body: unknown = await req.json();
    const url = body && typeof body === "object" && "url" in body && typeof body.url === "string" ? body.url : "";
    if (!url.trim()) return fail("url is required");
    if (url.length > 2048) return fail("url is too long");
    return json(await importFromUrl(url));
  }
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES + 64 * 1024) {
    return fail("File exceeds the 10 MB limit", 413);
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("file is required");
  if (file.size > MAX_IMPORT_BYTES) return fail("File exceeds the 10 MB limit", 413);
  if (!/\.(xlsx|csv)$/i.test(file.name)) return fail("Only .xlsx and .csv files are supported", 415);
  return json(await importProducts(Buffer.from(await file.arrayBuffer())));
});
