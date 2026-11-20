import { fail, json, withAdmin } from "@/server/http";
import { importFromUrl, importProducts } from "@/server/services/excel.service";

export const dynamic = "force-dynamic";

/** multipart/form-data with `file` (XLSX/CSV) or JSON { url } (Google Sheets / CSV link). */
export const POST = withAdmin(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const { url } = (await req.json()) as { url?: string };
    if (!url) return fail("url is required");
    return json(await importFromUrl(url));
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("file is required");
  return json(await importProducts(Buffer.from(await file.arrayBuffer())));
});
