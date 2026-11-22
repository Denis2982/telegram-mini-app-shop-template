"use client";

import { create } from "zustand";
import { api } from "@/api/client";
import { translate } from "@/lib/i18n";
import type { CategoryDto, ClientConfig, ProductDto } from "@/types";

export type SortKey = "popular" | "price_asc" | "price_desc" | "new";

interface ShopState {
  config: ClientConfig | null;
  categories: CategoryDto[];
  products: ProductDto[];
  loading: boolean;
  error: string | null;
  filters: { categoryId: number | null; q: string; min: string; max: string; sort: SortKey };
  init: (lang?: string) => Promise<void>;
  setFilters: (patch: Partial<ShopState["filters"]>) => void;
  resetFilters: () => void;
  loadProducts: () => Promise<void>;
}

const defaultFilters: ShopState["filters"] = { categoryId: null, q: "", min: "", max: "", sort: "popular" };
let reqId = 0;

export const useShopStore = create<ShopState>((set, get) => ({
  config: null,
  categories: [],
  products: [],
  loading: true,
  error: null,
  filters: defaultFilters,

  init: async (lang) => {
    try {
      const [config, categories] = await Promise.all([api.config(lang), api.categories()]);
      set({ config, categories });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "error", loading: false });
    }
  },

  setFilters: (patch) => {
    set({ filters: { ...get().filters, ...patch } });
    void get().loadProducts();
  },

  resetFilters: () => {
    set({ filters: defaultFilters });
    void get().loadProducts();
  },

  loadProducts: async () => {
    const id = ++reqId;
    const f = get().filters;
    const qs = new URLSearchParams();
    if (f.categoryId) qs.set("category", String(f.categoryId));
    if (f.q.trim()) qs.set("q", f.q.trim());
    if (f.min) qs.set("min", f.min);
    if (f.max) qs.set("max", f.max);
    qs.set("sort", f.sort);
    set({ loading: true });
    try {
      const products = await api.products(qs);
      if (id === reqId) set({ products, loading: false, error: null });
    } catch (e) {
      if (id === reqId) set({ loading: false, error: e instanceof Error ? e.message : "error" });
    }
  },
}));

/** Translation + money formatting bound to the loaded config. */
export function useT() {
  const config = useShopStore((s) => s.config);
  const dict = config?.dict ?? {};
  const symbol = config?.currencySymbol ?? "";
  return {
    t: (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
    money: (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ${symbol}`,
  };
}
