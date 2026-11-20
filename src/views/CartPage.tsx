"use client";

import { CheckoutForm } from "@/components/CheckoutForm";
import { PageHeader } from "@/components/Header";
import { Stepper } from "@/components/ProductModal";
import { useCartStore } from "@/store/useCartStore";
import { useT } from "@/store/useShopStore";
import type { OrderDto, PaymentInstruction } from "@/types";

export function CartPage({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (order: OrderDto, payment: PaymentInstruction) => void;
}) {
  const { t, money } = useT();
  const lines = useCartStore((s) => s.lines);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);

  return (
    <div className="pb-28">
      <PageHeader title={t("cart.title")} onBack={onBack} />
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
          <div className="text-6xl">🛒</div>
          <p className="text-lg text-tg-hint">{t("cart.empty")}</p>
          <button onClick={onBack} className="rounded-xl bg-tg-button px-6 py-3 font-semibold text-tg-button-text">
            {t("cart.goCatalog")}
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-3">
          <section className="divide-y divide-black/5 rounded-2xl bg-tg-bg px-4 shadow-sm">
            {lines.map((l) => (
              <div key={l.key} className="flex gap-3 py-3">
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.image} alt={l.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="h-20 w-20 shrink-0 rounded-xl bg-tg-secondary" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[15px] font-medium leading-snug">{l.name}</p>
                      {l.variantName && <p className="text-xs text-tg-hint">{l.variantName}</p>}
                    </div>
                    <button onClick={() => remove(l.key)} aria-label={t("cart.remove")} className="text-tg-hint">✕</button>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Stepper value={l.qty} max={l.maxStock} onChange={(n) => setQty(l.key, n)} />
                    <span className="font-bold">{money(l.price * l.qty)}</span>
                  </div>
                </div>
              </div>
            ))}
          </section>
          <CheckoutForm onCreated={onCreated} />
        </div>
      )}
    </div>
  );
}
