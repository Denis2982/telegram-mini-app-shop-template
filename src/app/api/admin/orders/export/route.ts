import { withAdmin } from "@/server/http";
import { exportOrdersToExcel } from "@/server/services/excel.service";
import { listAllOrders } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => {
  const buf = exportOrdersToExcel(await listAllOrders());
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="orders.xlsx"',
    },
  });
});
