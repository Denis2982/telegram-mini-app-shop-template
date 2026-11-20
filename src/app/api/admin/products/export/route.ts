import { withAdmin } from "@/server/http";
import { exportProducts } from "@/server/services/excel.service";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async (req) => {
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const buf = await exportProducts(format);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products.${format}"`,
    },
  });
});
