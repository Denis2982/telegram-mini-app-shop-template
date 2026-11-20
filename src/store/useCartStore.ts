"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductDto } from "@/types";

export interface CartLine {
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  image: string | null;
  price: number;
  qty: number;
  maxStock: number;
}

interface CartState {
  lines: CartLine[];
  add: (p: ProductDto, variantId: number | null, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (p, variantId, qty = 1) => {
        const v = variantId ? p.variants.find((x) => x.id === variantId) : undefined;
        const key = `${p.id}:${variantId ?? 0}`;
        const maxStock = v ? v.stock : p.stock;
        const existing = get().lines.find((l) => l.key === key);
        if (existing) {
          set({
            lines: get().lines.map((l) =>
              l.key === key ? { ...l, price: v?.price ?? p.price, maxStock, qty: Math.min(maxStock, l.qty + qty) } : l,
            ),
          });
        } else {
          set({
            lines: [
              ...get().lines,
              {
                key,
                productId: p.id,
                variantId,
                name: p.name,
                variantName: v?.name ?? null,
                image: p.images[0] ?? null,
                price: v?.price ?? p.price,
                qty: Math.min(maxStock, qty),
                maxStock,
              },
            ],
          });
        }
      },
      setQty: (key, qty) =>
        set({
          lines: get()
            .lines.map((l) => (l.key === key ? { ...l, qty: Math.min(l.maxStock, qty) } : l))
            .filter((l) => l.qty > 0),
        }),
      remove: (key) => set({ lines: get().lines.filter((l) => l.key !== key) }),
      clear: () => set({ lines: [] }),
    }),
    { name: "tma-shop-cart" },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.qty, 0);
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.qty * l.price, 0);
