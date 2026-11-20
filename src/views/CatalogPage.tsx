"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { MainAction } from "@/components/MainAction";
import { ProductCard } from "@/components/ProductCard";
import { ProductModal } from "@/components/ProductModal";
import { cartCount, cartSubtotal, useCartStore } from "@/store/useCartStore";
import { useShopStore, useT, type SortKey } from "@/store/useShopStore";
import type { ProductDto } from "@/types";

const SORTS: SortKey[] = ["popular", "price_asc", "price_desc", "new"];

export function CatalogPage({ onCart, onOrders }: { onCart: () => void; onOrders: () => void }) {
  const { t, money } = useT();
  const { products, categories, filters, loading, error, setFilters, resetFilters } = useShopStore();
  const lines = useCartStore((s) => s.lines);
  const [q, setQ] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState<ProductDto | null>(null);

  useEffect(() => {
    if (q === filters.q) return;
    const id = setTimeout(() => setFilters({ q }), 350);
    return () => clearTimeout(id);
  }, [q, filters.q, setFilters]);

  const selected = categories.find((c) => c.id === filters.categoryId);
  const topId = selected ? (selected.parentId ?? selected.id) : null;
  const top = categories.filter((c) => c.parentId === null);
  const children = topId ? categories.filter((c) => c.parentId === topId) : [];

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-1.5 text-sm transition ${active ? "bg-tg-button font-semibold text-tg-button-text" : "bg-tg-bg"}`;

  const count = cartCount(lines);

  return (
    <div className="pb-28">
      <Header onCart={onCart} onOrders={onOrders} q={q} onSearch={setQ} />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pt-3">
        <button className={chip(filters.categoryId === null)} onClick={() => setFilters({ categoryId: null })}>
          {t("catalog.all")}
        </button>
        {top.map((c) => (
          <button key={c.id} className={chip(topId === c.id && (filters.categoryId === c.id || !!selected?.parentId))} onClick={() => setFilters({ categoryId: c.id })}>
            {c.name}
          </button>
        ))}
        <button className={chip(showFilters)} onClick={() => setShowFilters((v) => !v)}>
          ⚙️ {t("catalog.filters")}
        </button>
      </div>

      {children.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pt-2">
          {children.map((c) => (
            <button key={c.id} className={`${chip(filters.categoryId === c.id)} !py-1 text-xs`} onClick={() => setFilters({ categoryId: filters.categoryId === c.id ? topId : c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="m-3 space-y-3 rounded-2xl bg-tg-bg p-4 shadow-sm">
          <div className="flex gap-2">
            <input inputMode="numeric" value={filters.min} onChange={(e) => setFilters({ min: e.target.value.replace(/\D/g, "") })} placeholder={t("catalog.priceFrom")} className="w-full rounded-xl bg-tg-secondary px-3 py-2.5 text-sm outline-none" />
            <input inputMode="numeric" value={filters.max} onChange={(e) => setFilters({ max: e.target.value.replace(/\D/g, "") })} placeholder={t("catalog.priceTo")} className="w-full rounded-xl bg-tg-secondary px-3 py-2.5 text-sm outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} className="w-full rounded-xl bg-tg-secondary px-3 py-2.5 text-sm outline-none">
              {SORTS.map((s) => (
                <option key={s} value={s}>{t(`sort.${s}`)}</option>
              ))}
            </select>
            <button onClick={() => { setQ(""); resetFilters(); }} className="shrink-0 px-2 text-sm text-tg-link">{t("catalog.reset")}</button>
          </div>
        </div>
      )}

      <main className="p-3">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {loading && products.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-tg-bg" />
            ))}
          </div>
        ) : products.length === 0 && !error ? (
          <p className="py-20 text-center text-tg-hint">🔎 {t("catalog.empty")}</p>
        ) : (
          <div className={`grid grid-cols-2 gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={setOpen} />
            ))}
          </div>
        )}
      </main>

      {open && <ProductModal product={open} onClose={() => setOpen(null)} />}
      <MainAction visible={count > 0 && !open} text={t("catalog.viewCart", { total: money(cartSubtotal(lines)) })} onClick={onCart} />
    </div>
  );
}
