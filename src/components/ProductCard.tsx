"use client";

import { haptic } from "@/hooks/useTelegram";
import { useCartStore } from "@/store/useCartStore";
import { useT } from "@/store/useShopStore";
import type { ProductDto } from "@/types";

export function ProductCard({ product, onOpen }: { product: ProductDto; onOpen: (p: ProductDto) => void }) {
  const { t, money } = useT();
  const add = useCartStore((s) => s.add);
  const hasVariants = product.variants.length > 0;
  const prices = product.variants.map((v) => v.price);
  const ranged = hasVariants && Math.min(...prices) !== Math.max(...prices);

  const onAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.light();
    if (hasVariants) onOpen(product);
    else add(product, null);
  };

  return (
    <article onClick={() => onOpen(product)} className="flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-tg-bg shadow-sm transition active:scale-[0.98]">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-tg-secondary">
        {product.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt={product.name} loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${product.inStock ? "" : "opacity-50 grayscale"}`} />
        )}
        {!product.inStock && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">{t("product.outOfStock")}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-[14px] font-medium leading-snug">{product.name}</h3>
        <p className="text-[15px] font-bold">{ranged ? t("product.from", { price: money(product.price) }) : money(product.price)}</p>
        <button
          onClick={onAdd}
          disabled={!product.inStock}
          className="mt-auto cursor-pointer rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-tg-secondary disabled:text-tg-hint"
        >
          {product.inStock ? t("product.add") : t("product.outOfStock")}
        </button>
      </div>
    </article>
  );
}
