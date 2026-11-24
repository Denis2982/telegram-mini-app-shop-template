"use client";

import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/Header";
import { useT } from "@/store/useShopStore";
import type { OrderDto } from "@/types";

export function OrdersPage({ onBack, onOpen }: { onBack: () => void; onOpen: (id: number) => void }) {
  const { t, money } = useT();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);

  useEffect(() => {
    api.orders().then(setOrders).catch(() => setOrders([]));
  }, []);

  return (
    <div>
      <PageHeader title={t("orders.title")} onBack={onBack} />
      <div className="space-y-3 p-3">
        {orders === null && <p className="py-20 text-center text-tg-hint">{t("catalog.loading")}</p>}
        {orders?.length === 0 && <p className="py-20 text-center text-tg-hint">🧾 {t("orders.empty")}</p>}
        {orders?.map((o) => (
          <button key={o.id} onClick={() => onOpen(o.id)} className="w-full cursor-pointer rounded-2xl bg-tg-bg p-4 text-left shadow-sm transition hover:bg-tg-secondary active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <span className="font-bold">{t("order.title", { id: o.id })}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${o.status === "cancelled" ? "bg-red-100 text-red-700" : o.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-tg-secondary"}`}>
                {t(`status.${o.status}`)}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-tg-hint">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}</p>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-tg-hint">{new Date(o.createdAt).toLocaleDateString()}</span>
              <span className="font-bold">{money(o.total)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
