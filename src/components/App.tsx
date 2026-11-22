"use client";

import { useCallback, useEffect, useState } from "react";
import { getWebApp, initTelegram, useBackButton } from "@/hooks/useTelegram";
import { useShopStore } from "@/store/useShopStore";
import type { PaymentInstruction } from "@/types";
import { CartPage } from "@/views/CartPage";
import { CatalogPage } from "@/views/CatalogPage";
import { OrderStatus } from "@/views/OrderStatus";
import { OrdersPage } from "@/views/OrdersPage";

type View =
  | { name: "catalog" }
  | { name: "cart" }
  | { name: "orders" }
  | { name: "order"; id: number; payment?: PaymentInstruction };

export function App() {
  
  const [stack, setStack] = useState<View[]>([{ name: "catalog" }]);
  const config = useShopStore((s) => s.config);
  const error = useShopStore((s) => s.error);
  const init = useShopStore((s) => s.init);

  useEffect(() => {
    initTelegram();
    
    void init(getWebApp()?.initDataUnsafe?.user?.language_code);
  }, [init]);

  const push = useCallback((v: View) => setStack((s) => [...s, v]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const toCatalog = useCallback(() => setStack([{ name: "catalog" }]), []);

  useBackButton(stack.length > 1, pop);

  useEffect(() => {
    if (config) document.title = config.storeName;
  }, [config]);

  if (!config) {
    return (
      <div className="grid min-h-screen place-items-center text-tg-hint">
        {error ? <p className="px-6 text-center">{error}</p> : <div className="h-8 w-8 animate-spin rounded-full border-4 border-tg-button border-t-transparent" />}
      </div>
    );
  }

  const view = stack[stack.length - 1];

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-tg-secondary">
      {view.name === "catalog" && <CatalogPage onCart={() => push({ name: "cart" })} onOrders={() => push({ name: "orders" })} />}
      {view.name === "cart" && (
        <CartPage onBack={pop} onCreated={(order, payment) => setStack([{ name: "catalog" }, { name: "order", id: order.id, payment }])} />
      )}
      {view.name === "orders" && <OrdersPage onBack={pop} onOpen={(id) => push({ name: "order", id })} />}
      {view.name === "order" && <OrderStatus key={view.id} id={view.id} initialPayment={view.payment} onBack={pop} onCatalog={toCatalog} />}
    </div>
  );
}
