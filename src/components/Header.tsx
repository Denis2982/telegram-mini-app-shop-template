"use client";

import { cartCount, useCartStore } from "@/store/useCartStore";
import { useShopStore, useT } from "@/store/useShopStore";

interface HeaderProps {
  onCart: () => void;
  onOrders: () => void;
  q: string;
  onSearch: (q: string) => void;
}

export function Header({ onCart, onOrders, q, onSearch }: HeaderProps) {
  const { t } = useT();
  const name = useShopStore((s) => s.config?.storeName);
  const count = useCartStore((s) => cartCount(s.lines));
  return (
    <header className="sticky top-0 z-30 bg-tg-bg px-4 pb-3 pt-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="truncate text-xl font-bold">{name}</h1>
        <div className="flex items-center gap-2">
          <button onClick={onOrders} aria-label={t("nav.orders")} className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-tg-secondary text-lg transition hover:brightness-95 active:scale-95">
            🧾
          </button>
          <button onClick={onCart} aria-label={t("nav.cart")} className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-tg-secondary text-lg transition hover:brightness-95 active:scale-95">
            🛒
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-tg-button px-1 text-[11px] font-bold text-tg-button-text">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
      <input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={`🔍  ${t("catalog.search")}`}
        className="w-full rounded-xl bg-tg-secondary px-4 py-2.5 text-[15px] outline-none placeholder:text-tg-hint"
      />
    </header>
  );
}

export function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-tg-bg px-4 py-3 shadow-sm">
      <button onClick={onBack} aria-label="Back" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-tg-secondary text-lg transition hover:brightness-95 active:scale-95">
        ←
      </button>
      <h1 className="truncate text-lg font-bold">{title}</h1>
    </header>
  );
}
